import { query } from '../config/db';
import { callGemini, resolveGeminiModel } from './router';
import { processIngestion } from './ingestion';

export interface DiscoveredGap {
  id?: string;
  agent_id: string;
  topic_title: string;
  frequency: number;
  sample_queries: string[];
  impact_score: 'critical' | 'high' | 'medium';
  status: 'pending' | 'approved' | 'dismissed';
  draft_content: string;
  suggested_aop?: Record<string, any>;
  created_at?: string;
}

/**
 * Ensures the duet_knowledge_gaps table exists (graceful self-migration)
 */
export async function ensureDuetTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS duet_knowledge_gaps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      topic_title TEXT NOT NULL,
      frequency INT NOT NULL DEFAULT 1,
      sample_queries TEXT[] NOT NULL DEFAULT '{}',
      impact_score TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'dismissed')),
      draft_content TEXT NOT NULL,
      suggested_aop JSONB,
      created_at TIMESTAMPTZ DEFAULT now(),
      resolved_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_duet_gaps_agent ON duet_knowledge_gaps(agent_id);
  `);
}

/**
 * Runs Decagon Duet Active Learning analysis on an agent's chat transcripts,
 * tickets, and low-confidence escalations.
 */
export async function runDuetAnalysis(agentId: string): Promise<DiscoveredGap[]> {
  await ensureDuetTable();

  // 1. Fetch Agent details
  const agentRes = await query(`SELECT template_type, llm_model FROM agents WHERE id = $1`, [agentId]);
  const activeModel = resolveGeminiModel(agentRes.rows[0]?.llm_model || 'gemini-3.8-flash');
  const templateType = agentRes.rows[0]?.template_type || 'support';

  // 2. Fetch recent user messages and ticket topics
  const messagesRes = await query(
    `SELECT m.content 
     FROM messages m 
     JOIN conversations c ON m.conversation_id = c.id 
     WHERE c.agent_id = $1 AND m.role = 'user' 
     ORDER BY m.created_at DESC 
     LIMIT 50`,
    [agentId]
  );

  const ticketsRes = await query(
    `SELECT subject, description 
     FROM tickets 
     WHERE agent_id = $1 
     ORDER BY created_at DESC 
     LIMIT 25`,
    [agentId]
  );

  const userQueries = messagesRes.rows.map(r => r.content.trim()).filter(Boolean);
  const ticketSummaries = ticketsRes.rows.map(r => `${r.subject}: ${r.description.slice(0, 100)}`);

  const combinedEvidence = [
    ...userQueries,
    ...ticketSummaries
  ].slice(0, 40);

  // If evidence is sparse, enrich with common support domain edge cases
  const evidenceText = combinedEvidence.length > 3
    ? combinedEvidence.map((q, idx) => `${idx + 1}. "${q}"`).join('\n')
    : `1. "Can I get an invoice with our European VAT ID and company tax number?"
2. "Where do I download past monthly invoices as PDF?"
3. "Do you offer tax exemptions for 501(c)(3) non-profit organizations?"
4. "Why was I charged sales tax when my company is exempt?"
5. "Can we pay via wire transfer or SEPA direct debit instead of credit card?"`;

  const clusteringPrompt = `You are "Duet", an autonomous Active Learning and Knowledge Discovery system for enterprise customer support (inspired by Decagon AI).

Your task is to analyze production support inquiries and identify UNRESOLVED KNOWLEDGE GAPS (questions customers ask that typically lack direct documentation or require clear policy guides).

Inbound Customer Inquiries & Escalated Tickets:
----------------------------------------------
${evidenceText}
----------------------------------------------
Agent Template Context: ${templateType}

Analyze the inquiries, group them into 2 to 3 distinct high-value topic clusters, and draft comprehensive, verified knowledge base articles that will permanently resolve them.

Respond in strict JSON format:
{
  "gaps": [
    {
      "topic_title": "Short descriptive topic title (e.g. VAT Invoices & Tax Exemption Procedures)",
      "frequency": 14,
      "sample_queries": [
        "How do I add my EU VAT number?",
        "Where can I download PDF receipts?",
        "Do you support tax exempt status?"
      ],
      "impact_score": "high", // "critical", "high", or "medium"
      "draft_content": "A comprehensive markdown FAQ article with headings, clear steps, and explicit policy terms to resolve these inquiries completely.",
      "suggested_aop": {
        "name": "Procedure name if actionable",
        "description": "Brief description",
        "trigger_keywords": ["vat", "tax", "invoice"],
        "steps": ["Step 1...", "Step 2..."],
        "guardrails": ["Guardrail 1..."],
        "escalation_criteria": ["Escalate if..."]
      }
    }
  ]
}`;

  try {
    const res = await callGemini(
      'You are Decagon Duet. Output valid JSON only.',
      [],
      clusteringPrompt,
      undefined,
      activeModel
    );

    const match = res.reply.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed.gaps)) {
        const savedGaps: DiscoveredGap[] = [];

        for (const gap of parsed.gaps) {
          // Avoid duplicate pending topics
          const existing = await query(
            `SELECT id FROM duet_knowledge_gaps WHERE agent_id = $1 AND topic_title = $2 AND status = 'pending'`,
            [agentId, gap.topic_title]
          );

          if (!existing.rowCount || existing.rowCount === 0) {
            const insertRes = await query(
              `INSERT INTO duet_knowledge_gaps 
               (agent_id, topic_title, frequency, sample_queries, impact_score, status, draft_content, suggested_aop)
               VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)
               RETURNING *`,
              [
                agentId,
                gap.topic_title,
                gap.frequency || 5,
                Array.isArray(gap.sample_queries) ? gap.sample_queries : [],
                gap.impact_score || 'medium',
                gap.draft_content || '',
                gap.suggested_aop ? JSON.stringify(gap.suggested_aop) : null
              ]
            );
            savedGaps.push(insertRes.rows[0]);
          }
        }

        // Return all pending gaps
        const allRes = await query(
          `SELECT * FROM duet_knowledge_gaps WHERE agent_id = $1 ORDER BY created_at DESC`,
          [agentId]
        );
        return allRes.rows;
      }
    }
  } catch (err: any) {
    console.error('[DuetWorker] Analysis run failed:', err.message);
  }

  const fallbackRes = await query(
    `SELECT * FROM duet_knowledge_gaps WHERE agent_id = $1 ORDER BY created_at DESC`,
    [agentId]
  );
  return fallbackRes.rows;
}

/**
 * 1-Click Approval: Ingests the draft content directly into the agent's vector database (pgvector)
 * and activates any suggested AOP procedure.
 */
export async function approveKnowledgeGap(agentId: string, gapId: string): Promise<{ success: boolean; message: string }> {
  await ensureDuetTable();

  const gapRes = await query(
    `SELECT * FROM duet_knowledge_gaps WHERE id = $1 AND agent_id = $2`,
    [gapId, agentId]
  );

  if (!gapRes.rowCount || gapRes.rowCount === 0) {
    throw new Error('Knowledge gap not found');
  }

  const gap = gapRes.rows[0];

  // 1. Create a data_sources record
  const dsRes = await query(
    `INSERT INTO data_sources (agent_id, source_type, source_ref, status)
     VALUES ($1, 'file', $2, 'pending')
     RETURNING id`,
    [agentId, `Duet Auto-Ingest: ${gap.topic_title}`]
  );
  const dataSourceId = dsRes.rows[0].id;

  // 2. Vectorize and ingest the markdown draft into chunks table using pgvector
  await processIngestion(agentId, dataSourceId, gap.draft_content, gap.topic_title);

  // 3. If a structured AOP procedure was suggested, insert into agent_aops
  if (gap.suggested_aop && typeof gap.suggested_aop === 'object') {
    const aop = gap.suggested_aop;
    try {
      await query(
        `INSERT INTO agent_aops 
         (agent_id, name, description, trigger_keywords, steps, guardrails, escalation_criteria, enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true)
         ON CONFLICT DO NOTHING`,
        [
          agentId,
          aop.name || gap.topic_title,
          aop.description || `Auto-generated by Duet from recurring inquiries`,
          Array.isArray(aop.trigger_keywords) ? aop.trigger_keywords : [],
          Array.isArray(aop.steps) ? aop.steps : [],
          Array.isArray(aop.guardrails) ? aop.guardrails : [],
          Array.isArray(aop.escalation_criteria) ? aop.escalation_criteria : []
        ]
      );
    } catch (aopErr: any) {
      console.warn('[DuetWorker] AOP auto-creation warning:', aopErr.message);
    }
  }

  // 4. Mark gap as approved
  await query(
    `UPDATE duet_knowledge_gaps SET status = 'approved', resolved_at = now() WHERE id = $1`,
    [gapId]
  );

  return {
    success: true,
    message: `Knowledge gap "${gap.topic_title}" successfully vectorized and deployed to agent knowledge base.`
  };
}

/**
 * Dismisses a recommended knowledge gap.
 */
export async function dismissKnowledgeGap(agentId: string, gapId: string): Promise<void> {
  await ensureDuetTable();
  await query(
    `UPDATE duet_knowledge_gaps SET status = 'dismissed', resolved_at = now() WHERE id = $1 AND agent_id = $2`,
    [gapId, agentId]
  );
}
