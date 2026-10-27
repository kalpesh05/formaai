import { Router, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AuthenticatedRequest, authenticateAgency, assertWorkspaceBelongsToAgency, assertAgentBelongsToAgency } from '../middleware/auth';
import pool, { query } from '../config/db';
import { TEMPLATES } from '../config/templates';
import { callGemini } from '../services/router';
import { processIngestion } from '../services/ingestion';

const router = Router();

const asyncHandler = (fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

// GET /api/v1/templates - List all available agent presets and templates
router.get('/templates', asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  return res.json(TEMPLATES);
}));

// GET /api/v1/workspaces/:workspaceId/agents - List all agents inside a workspace
router.get('/workspaces/:workspaceId/agents', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { workspaceId } = req.params;
  const agencyId = req.agencyId!;

  // Verify workspace is owned by the authenticated agency
  await assertWorkspaceBelongsToAgency(workspaceId, agencyId);

  const result = await query(
    `SELECT id, template_type, name, llm_provider, llm_model, status, created_at
     FROM agents
     WHERE client_workspace_id = $1
     ORDER BY created_at DESC`,
    [workspaceId]
  );

  return res.json(result.rows);
}));

// POST /api/v1/workspaces/:workspaceId/agents - Create an agent in a workspace using a preset template
router.post('/workspaces/:workspaceId/agents', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { workspaceId } = req.params;
  const { template_type, name } = req.body;
  const agencyId = req.agencyId!;

  if (!template_type || !name) {
    return res.status(400).json({ error: 'template_type and name are required' });
  }

  const validTemplates = Object.keys(TEMPLATES);
  if (!validTemplates.includes(template_type)) {
    return res.status(400).json({ error: `template_type must be one of: ${validTemplates.join(', ')}` });
  }

  // Verify workspace ownership
  await assertWorkspaceBelongsToAgency(workspaceId, agencyId);

  // Enforce plan limits & trial expiration
  const { checkAgentCreationAllowed } = await import('../utils/planLimits');
  const check = await checkAgentCreationAllowed(workspaceId);
  if (!check.allowed) {
    return res.status(403).json({
      error: check.error,
      code: check.code,
      current: check.current,
      limit: check.limit,
      plan_tier: check.plan_tier,
    });
  }

  const preset = TEMPLATES[template_type as keyof typeof TEMPLATES];

  // Checkout a dedicated client connection from the pool for transactional queries
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // 1. Insert the agent
    const agentInsertResult = await client.query(
      `INSERT INTO agents (client_workspace_id, template_type, name, llm_provider, llm_model, config, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'draft')
       RETURNING id, client_workspace_id, template_type, name, llm_provider, llm_model, status, config, created_at`,
      [workspaceId, template_type, name, preset.llm_provider, preset.llm_model, JSON.stringify(preset.config)]
    );
    const agent = agentInsertResult.rows[0];

    // 2. Seed default tools
    const tools = [];
    for (const tool of preset.tools) {
      const toolInsertResult = await client.query(
        `INSERT INTO agent_tools (agent_id, tool_type, tool_config, enabled)
         VALUES ($1, $2, $3, true)
         RETURNING id, tool_type, tool_config, enabled`,
        [agent.id, tool.tool_type, JSON.stringify(tool.tool_config)]
      );
      tools.push(toolInsertResult.rows[0]);
    }

    await client.query('COMMIT');
    return res.status(201).json({ ...agent, tools });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

// GET /api/v1/agents/:id - Fetch detailed agent settings including tools and data sources
router.get('/agents/:id', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const agencyId = req.agencyId!;

  // Verify agent ownership
  await assertAgentBelongsToAgency(id, agencyId);

  // Get Agent details
  const agentResult = await query(
    `SELECT id, client_workspace_id, template_type, name, llm_provider, llm_model, status, config, api_key, created_at
     FROM agents
     WHERE id = $1`,
    [id]
  );
  
  if (!agentResult.rowCount || agentResult.rowCount === 0) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  const agent = agentResult.rows[0];

  // Get tools
  const toolsResult = await query(
    `SELECT id, tool_type, tool_config, enabled FROM agent_tools WHERE agent_id = $1`,
    [id]
  );
  let tools = toolsResult.rows;

  // Auto-seed missing telemetry, state & enterprise connector tools for agents
  const existingTypes = new Set(tools.map(t => t.tool_type));
  const candidateTools = [
    { tool_type: 'ticket_create', tool_config: {} },
    { tool_type: 'database_query', tool_config: { description: 'Read-only live database & billing verification' } },
    { tool_type: 'sentry_telemetry', tool_config: { description: 'Sentry application error trace & crash correlator' } },
    { tool_type: 'shopify_orders', tool_config: { description: '2-Way Shopify order lookup, cancellation & RMA return portal' } },
    { tool_type: 'zendesk_sync', tool_config: { description: '2-Way Zendesk ticket creation & AI warm handoff sync' } }
  ];

  for (const cand of candidateTools) {
    if (!existingTypes.has(cand.tool_type)) {
      try {
        const ins = await query(
          `INSERT INTO agent_tools (agent_id, tool_type, tool_config, enabled) VALUES ($1, $2, $3, true) RETURNING id, tool_type, tool_config, enabled`,
          [id, cand.tool_type, JSON.stringify(cand.tool_config)]
        );
        tools.push(ins.rows[0]);
      } catch (e: any) {
        // Safe skip on unique conflict
      }
    }
  }

  // Get data sources
  const dataSourcesResult = await query(
    `SELECT id, source_type, source_ref, status, created_at FROM data_sources WHERE agent_id = $1`,
    [id]
  );

  return res.json({
    ...agent,
    tools,
    data_sources: dataSourcesResult.rows
  });
}));

// PATCH /api/v1/agents/:id - Update agent configuration parameters
router.patch('/agents/:id', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { name, llm_provider, llm_model, config } = req.body;
  const agencyId = req.agencyId!;

  // Verify agent ownership
  await assertAgentBelongsToAgency(id, agencyId);

  const updates: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (name !== undefined) {
    updates.push(`name = $${idx++}`);
    values.push(name);
  }
  if (llm_provider !== undefined) {
    updates.push(`llm_provider = $${idx++}`);
    values.push(llm_provider);
  }
  if (llm_model !== undefined) {
    updates.push(`llm_model = $${idx++}`);
    values.push(llm_model);
  }
  if (config !== undefined) {
    updates.push(`config = $${idx++}`);
    values.push(JSON.stringify(config));
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'At least one field to update must be provided' });
  }

  values.push(id);
  const updateQuery = `
    UPDATE agents 
    SET ${updates.join(', ')} 
    WHERE id = $${idx} 
    RETURNING id, client_workspace_id, template_type, name, llm_provider, llm_model, status, config, api_key, created_at
  `;

  const result = await query(updateQuery, values);
  if (!result.rowCount || result.rowCount === 0) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  return res.json(result.rows[0]);
}));

// POST /api/v1/agents/:id/deploy - Deploy agent: generates a secure API key and sets status to live
router.post('/agents/:id/deploy', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const agencyId = req.agencyId!;

  // Verify agent ownership
  await assertAgentBelongsToAgency(id, agencyId);

  // Generate cryptographically secure client widget API token with fa_live_ prefix
  const rawKey = crypto.randomBytes(24).toString('hex');
  const apiKey = `fa_live_${rawKey}`;

  const result = await query(
    `UPDATE agents
     SET status = 'live', api_key = $1
     WHERE id = $2
     RETURNING api_key, status`,
    [apiKey, id]
  );

  if (!result.rowCount || result.rowCount === 0) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  return res.json(result.rows[0]);
}));

// PATCH /api/v1/agent-tools/:toolId - Enable/disable or configure a specific tool
router.patch('/agent-tools/:toolId', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { toolId } = req.params;
  const { enabled, tool_config } = req.body;
  const agencyId = req.agencyId!;

  // Verify the tool belongs to an agent owned by the agency
  const toolCheck = await query(
    `SELECT t.id, a.id as agent_id FROM agent_tools t
     JOIN agents a ON t.agent_id = a.id
     JOIN client_workspaces w ON a.client_workspace_id = w.id
     WHERE t.id = $1 AND w.agency_id = $2`,
    [toolId, agencyId]
  );
  if (!toolCheck.rowCount || toolCheck.rowCount === 0) {
    return res.status(403).json({ error: 'Access denied or tool not found' });
  }

  const updates: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (enabled !== undefined) {
    updates.push(`enabled = $${idx++}`);
    values.push(enabled);
  }
  if (tool_config !== undefined) {
    updates.push(`tool_config = $${idx++}`);
    values.push(JSON.stringify(tool_config));
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'At least enabled or tool_config must be provided' });
  }

  values.push(toolId);
  const updateResult = await query(
    `UPDATE agent_tools SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, tool_type, tool_config, enabled`,
    values
  );
  return res.json(updateResult.rows[0]);
}));

// GET /api/v1/agents/:id/conversations - List conversations with message counts and search
router.get('/agents/:id/conversations', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id: agentId } = req.params;
  const { search, limit = '50' } = req.query;
  const agencyId = req.agencyId!;

  await assertAgentBelongsToAgency(agentId, agencyId);

  let queryText = `
    SELECT 
      c.id,
      c.end_user_ref,
      c.created_at,
      COUNT(m.id)::int as message_count,
      (
        SELECT content FROM messages 
        WHERE conversation_id = c.id 
        ORDER BY created_at DESC LIMIT 1
      ) as last_message,
      (
        SELECT created_at FROM messages 
        WHERE conversation_id = c.id 
        ORDER BY created_at DESC LIMIT 1
      ) as last_activity
    FROM conversations c
    LEFT JOIN messages m ON c.id = m.conversation_id
    WHERE c.agent_id = $1
  `;
  const params: any[] = [agentId];

  if (search && typeof search === 'string' && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    queryText += ` AND (LOWER(c.end_user_ref) LIKE $${params.length} OR EXISTS (
      SELECT 1 FROM messages sm 
      WHERE sm.conversation_id = c.id AND LOWER(sm.content) LIKE $${params.length}
    ))`;
  }

  queryText += `
    GROUP BY c.id
    ORDER BY COALESCE(
      (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1),
      c.created_at
    ) DESC
    LIMIT $${params.length + 1}
  `;
  params.push(Math.min(parseInt(limit as string, 10) || 50, 100));

  const result = await query(queryText, params);
  return res.json(result.rows);
}));

// GET /api/v1/agents/:id/conversations-stats - Conversation volume & interaction metrics
router.get('/agents/:id/conversations-stats', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id: agentId } = req.params;
  const agencyId = req.agencyId!;

  await assertAgentBelongsToAgency(agentId, agencyId);

  const statsRes = await query(`
    SELECT 
      COUNT(DISTINCT c.id)::int as total_conversations,
      COUNT(m.id)::int as total_messages,
      ROUND(COALESCE(AVG(sub.cnt), 0), 1) as avg_messages_per_conversation
    FROM conversations c
    LEFT JOIN messages m ON c.id = m.conversation_id
    LEFT JOIN (
      SELECT conversation_id, COUNT(*) as cnt FROM messages GROUP BY conversation_id
    ) sub ON sub.conversation_id = c.id
    WHERE c.agent_id = $1
  `, [agentId]);

  return res.json(statsRes.rows[0] || { total_conversations: 0, total_messages: 0, avg_messages_per_conversation: 0 });
}));

// GET /api/v1/agents/:id/conversations/:convId - Get full message transcript
router.get('/agents/:id/conversations/:convId', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id: agentId, convId } = req.params;
  const agencyId = req.agencyId!;

  await assertAgentBelongsToAgency(agentId, agencyId);

  const convRes = await query(`
    SELECT c.id, c.end_user_ref, c.created_at, a.name as agent_name, a.template_type
    FROM conversations c
    JOIN agents a ON c.agent_id = a.id
    WHERE c.id = $1 AND c.agent_id = $2
  `, [convId, agentId]);

  if (convRes.rowCount === 0) {
    return res.status(404).json({ error: 'Conversation session not found' });
  }

  const messagesRes = await query(`
    SELECT id, role, content, created_at
    FROM messages
    WHERE conversation_id = $1
    ORDER BY created_at ASC
  `, [convId]);

  return res.json({
    conversation: convRes.rows[0],
    messages: messagesRes.rows
  });
}));

// POST /api/v1/agents/:id/conversations/:convId/reply - Operator manual human reply into session
router.post('/agents/:id/conversations/:convId/reply', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id: agentId, convId } = req.params;
  const { message } = req.body;
  const agencyId = req.agencyId!;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message content is required' });
  }

  await assertAgentBelongsToAgency(agentId, agencyId);

  const insertRes = await query(`
    INSERT INTO messages (conversation_id, role, content)
    VALUES ($1, 'assistant', $2)
    RETURNING id, role, content, created_at
  `, [convId, message.trim()]);

  return res.status(201).json(insertRes.rows[0]);
}));

// POST /api/v1/agents/:id/conversations/:convId/learn - Extract resolved Q&A from conversation and save into RAG
router.post('/agents/:id/conversations/:convId/learn', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id: agentId, convId } = req.params;
  const agencyId = req.agencyId!;

  await assertAgentBelongsToAgency(agentId, agencyId);

  // Fetch full conversation history
  const messagesRes = await query(`
    SELECT role, content FROM messages
    WHERE conversation_id = $1
    ORDER BY created_at ASC
  `, [convId]);

  if (!messagesRes.rowCount || messagesRes.rowCount < 2) {
    return res.status(400).json({ error: 'Conversation must have at least 2 messages to extract a verified Q&A pair.' });
  }

  const transcriptText = messagesRes.rows
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  const extractionPrompt = `You are an Expert Customer Support Knowledge Architect.
Analyze the following conversation transcript between a customer and support/bot.
Extract the customer's core question or problem and the verified solution/steps provided.
Format the output as a clean, self-contained Markdown FAQ document:
# Question / Issue Title
### Problem Description:
(Explain the user's issue clearly)
### Verified Resolution & Steps:
(Step-by-step resolution)

Do not add conversational filler or hello/goodbyes. Only output high-value instructional knowledge.`;

  const geminiRes = await callGemini(
    extractionPrompt,
    [],
    `Conversation Transcript:\n\n${transcriptText}`,
    [],
    'gemini-3.8-flash'
  );

  const learnedMarkdown = geminiRes.reply;
  if (!learnedMarkdown || learnedMarkdown.trim().length < 20) {
    return res.status(500).json({ error: 'Failed to extract meaningful knowledge from this conversation.' });
  }

  // Insert a new data source record for this learned Q&A
  const sourceRef = `[Learned Q&A] Session #${convId.slice(0, 8)}`;
  const dsRes = await query(
    `INSERT INTO data_sources (agent_id, source_type, source_ref, status)
     VALUES ($1, 'file', $2, 'pending')
     RETURNING id`,
    [agentId, sourceRef]
  );
  const dataSourceId = dsRes.rows[0].id;

  // Ingest learned content into vector chunks
  await processIngestion(agentId, dataSourceId, learnedMarkdown, `Learned Support Q&A (${convId.slice(0, 8)})`);

  return res.json({
    success: true,
    message: 'Successfully extracted Q&A and ingested into knowledge base!',
    dataSourceId,
    learnedContent: learnedMarkdown
  });
}));

export default router;
