import { query } from '../config/db';
import { callGemini } from './router';
import { generateAutoFix } from './autofix';
import { TEMPLATES, TemplateType } from '../config/templates';

export interface ResolveTicketOptions {
  ticketId: string;
  agentId?: string;
  agencyId?: string;
}

export interface TicketResolutionResult {
  success: boolean;
  ticketId: string;
  agentId: string;
  agentName: string;
  templateType: string;
  status: 'ready_for_review' | 'resolved' | 'failed';
  resolutionSummary: string;
  details?: any;
}

/**
 * Executes autonomous ticket resolution by assigning a specialized AI worker 
 * (HR, Backend Engineer, Frontend Specialist, QA, or Support Engineer).
 */
export async function resolveTicketWithAgent(options: ResolveTicketOptions): Promise<TicketResolutionResult> {
  const { ticketId, agentId } = options;

  // 1. Fetch Ticket
  const ticketRes = await query(
    `SELECT t.id, t.agent_id, t.assigned_agent_id, t.subject, t.description, t.department, t.priority, t.status, t.automated_status,
            a.client_workspace_id
     FROM tickets t
     JOIN agents a ON t.agent_id = a.id
     WHERE t.id = $1`,
    [ticketId]
  );

  if (!ticketRes.rowCount || ticketRes.rowCount === 0) {
    throw new Error('Ticket not found');
  }

  const ticket = ticketRes.rows[0];
  const workspaceId = ticket.client_workspace_id;

  // 2. Determine which agent will resolve this ticket
  let resolvingAgentId = agentId || ticket.assigned_agent_id;
  let targetAgent: any = null;

  if (resolvingAgentId) {
    const aRes = await query(
      `SELECT id, name, template_type, llm_provider, llm_model, config FROM agents WHERE id = $1`,
      [resolvingAgentId]
    );
    if (aRes.rowCount && aRes.rowCount > 0) {
      targetAgent = aRes.rows[0];
    }
  }

  // If no agent assigned yet, find the most appropriate agent in the same workspace
  if (!targetAgent) {
    let preferredTemplate: TemplateType = 'support';
    if (ticket.department === 'hr') preferredTemplate = 'hr';
    else if (ticket.department === 'engineering' || ticket.description.toLowerCase().includes('sql') || ticket.description.toLowerCase().includes('error')) {
      preferredTemplate = 'backend_dev';
    } else if (ticket.department === 'qa') {
      preferredTemplate = 'qa_tester';
    }

    const matchRes = await query(
      `SELECT id, name, template_type, llm_provider, llm_model, config 
       FROM agents 
       WHERE client_workspace_id = $1 AND template_type = $2 
       ORDER BY created_at ASC LIMIT 1`,
      [workspaceId, preferredTemplate]
    );

    if (matchRes.rowCount && matchRes.rowCount > 0) {
      targetAgent = matchRes.rows[0];
    } else {
      // Fallback to ticket creator agent
      const fallbackRes = await query(
        `SELECT id, name, template_type, llm_provider, llm_model, config FROM agents WHERE id = $1`,
        [ticket.agent_id]
      );
      targetAgent = fallbackRes.rows[0];
    }
    resolvingAgentId = targetAgent.id;
  }

  const templateType: TemplateType = targetAgent.template_type as TemplateType;
  const agentName: string = targetAgent.name;
  let resolutionSummary = '';
  let details: any = {};

  // 3. Mark ticket as in_progress
  await query(
    `UPDATE tickets 
     SET assigned_agent_id = $1, automated_status = 'in_progress' 
     WHERE id = $2`,
    [resolvingAgentId, ticketId]
  );

  try {
    // 4. Execute Resolution Logic depending on agent specialty
    if (templateType === 'backend_dev' || templateType === 'frontend_dev') {
      // Software Engineering Agent: Diagnoses root cause, writes reproduction test, generates patch diff
      const autoFixResult = await generateAutoFix({
        agentId: resolvingAgentId,
        ticketId: ticket.id,
        title: `Autonomous Fix: ${ticket.subject}`,
        bugDescription: `${ticket.subject}\n\n${ticket.description}`,
      });

      resolutionSummary = `Autonomous Code Patch Generated on branch \`${autoFixResult.branch_name}\`.\n` +
        `• Target: ${autoFixResult.target_file}\n` +
        `• Reproduction Test synthesized (Vitest/Jest).\n` +
        `• Patch diff ready for review.`;

      details = {
        autofix_pr_id: autoFixResult.id,
        branch_name: autoFixResult.branch_name,
        target_file: autoFixResult.target_file,
        patch_diff: autoFixResult.patch_diff,
        reproduction_test: autoFixResult.reproduction_test,
        github_pr_url: autoFixResult.github_pr_url
      };

    } else if (templateType === 'qa_tester') {
      // QA Agent: Generates edge case matrix and automated test suite
      const systemPrompt = TEMPLATES.qa_tester.config.systemPrompt;
      const prompt = `Review the following ticket and generate a complete automated test suite (Jest/Vitest) that covers all edge cases and regression scenarios.\n\nTicket Subject: ${ticket.subject}\nDetails: ${ticket.description}`;
      
      const aiResponse = await callGemini(systemPrompt, [], prompt, [], targetAgent.llm_model || 'gemini-3.1-pro');
      resolutionSummary = `QA Test Suite Synthesized:\n\n${aiResponse.reply.slice(0, 500)}...`;
      details = { test_suite: aiResponse.reply };

    } else if (templateType === 'hr') {
      // HR Concierge Agent: Pulls relevant policy knowledge and drafts formal employee response
      const systemPrompt = TEMPLATES.hr.config.systemPrompt;

      // Search knowledge chunks for company policy context
      const chunksRes = await query(
        `SELECT content FROM chunks WHERE agent_id = $1 ORDER BY id DESC LIMIT 5`,
        [resolvingAgentId]
      );
      const policyContext = chunksRes.rows.map(r => r.content).join('\n---\n') || 'Standard Employee Handbook & Guidelines';

      const prompt = `Company Policies:\n${policyContext}\n\nEmployee Query / Ticket:\nSubject: ${ticket.subject}\n${ticket.description}\n\nProvide an empathetic, policy-accurate resolution and outline next steps.`;

      const aiResponse = await callGemini(systemPrompt, [], prompt, [], targetAgent.llm_model || 'gemini-3.8-flash');
      resolutionSummary = aiResponse.reply;
      details = { reply: aiResponse.reply };

      // Record in copilot_drafts
      await query(
        `INSERT INTO copilot_drafts (agent_id, user_query, draft_reply, confidence_score, status)
         VALUES ($1, $2, $3, 0.94, 'pending')`,
        [resolvingAgentId, `${ticket.subject}: ${ticket.description}`, resolutionSummary]
      );

    } else {
      // Default: Support Agent (L1/L2 Technical & Product Support)
      const systemPrompt = targetAgent.config?.systemPrompt || TEMPLATES.support.config.systemPrompt;
      const prompt = `Customer Ticket:\nSubject: ${ticket.subject}\nDescription: ${ticket.description}\n\nDiagnose the root problem, provide clear step-by-step resolution steps, and draft the response for the customer.`;

      const aiResponse = await callGemini(systemPrompt, [], prompt, [], targetAgent.llm_model || 'gemini-3.8-flash');
      resolutionSummary = aiResponse.reply;
      details = { reply: aiResponse.reply };

      // Record in copilot_drafts
      await query(
        `INSERT INTO copilot_drafts (agent_id, user_query, draft_reply, confidence_score, status)
         VALUES ($1, $2, $3, 0.92, 'pending')`,
        [resolvingAgentId, `${ticket.subject}: ${ticket.description}`, resolutionSummary]
      );
    }

    // 5. Update Ticket status to 'ready_for_review'
    await query(
      `UPDATE tickets 
       SET assigned_agent_id = $1, 
           automated_status = 'ready_for_review', 
           resolution_summary = $2
       WHERE id = $3`,
      [resolvingAgentId, resolutionSummary, ticketId]
    );

    // 6. Record audit action log
    await query(
      `INSERT INTO action_logs (agent_id, action_type, action_input, action_result, status)
       VALUES ($1, 'autonomous_ticket_resolution', $2, $3, 'success')`,
      [
        resolvingAgentId,
        JSON.stringify({ ticket_id: ticketId, subject: ticket.subject, template_type: templateType }),
        JSON.stringify({ summary: resolutionSummary.slice(0, 300), details })
      ]
    );

    return {
      success: true,
      ticketId,
      agentId: resolvingAgentId,
      agentName,
      templateType,
      status: 'ready_for_review',
      resolutionSummary,
      details
    };

  } catch (error: any) {
    console.error('Ticket resolution error:', error);
    await query(
      `UPDATE tickets SET automated_status = 'idle' WHERE id = $1`,
      [ticketId]
    );

    return {
      success: false,
      ticketId,
      agentId: resolvingAgentId,
      agentName,
      templateType,
      status: 'failed',
      resolutionSummary: `Resolution failed: ${error.message}`
    };
  }
}
