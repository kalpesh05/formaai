import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest, authenticateAgency, assertWorkspaceBelongsToAgency } from '../middleware/auth';
import { query } from '../config/db';
import {
  processInboundEmail,
  sendThreadReply,
  getThreadDetails,
} from '../services/mailboxService';

const router = Router();

const asyncHandler = (fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

/**
 * Public Inbound Webhook Endpoint for Email Service Providers (SendGrid, Postmark, Mailgun, Cloudflare, AWS SES)
 * POST /api/v1/integrations/email/webhook
 */
router.post(
  '/integrations/email/webhook',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const body = req.body || {};

    // Normalize payload across standard email webhook providers
    const to = body.to || body.recipient || body.To || '';
    const from = body.from || body.sender || body.From || '';
    const subject = body.subject || body.Subject || 'Support Request';
    const text = body.text || body.body || body['body-plain'] || body['stripped-text'] || '';
    const html = body.html || body['body-html'] || body['stripped-html'] || null;
    const messageId = body.messageId || body['Message-Id'] || body['message-id'] || null;
    const inReplyTo = body.inReplyTo || body['In-Reply-To'] || body['in-reply-to'] || null;
    const references = body.references || body.References || null;
    const workspaceId = body.workspaceId || body.workspace_id || null;

    if (!from || (!text && !subject)) {
      return res.status(400).json({ error: 'Invalid email payload: from and content are required' });
    }

    try {
      const result = await processInboundEmail({
        workspaceId,
        to,
        from,
        subject,
        text,
        html,
        messageId,
        inReplyTo,
        references,
      });

      return res.status(200).json({ success: true, ...result });
    } catch (err: any) {
      console.error('[MAILBOX WEBHOOK ERROR]:', err.message);
      return res.status(500).json({ error: err.message });
    }
  })
);

/**
 * Workspace Scoped Mailbox Endpoints
 */

// GET /api/v1/workspaces/:wsId/mailbox/threads - List threads for a workspace
router.get(
  '/workspaces/:wsId/mailbox/threads',
  authenticateAgency,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { wsId } = req.params;
    const agencyId = req.agencyId!;
    await assertWorkspaceBelongsToAgency(wsId, agencyId);

    const { status = 'all', ai_status = 'all', search = '' } = req.query as {
      status?: string;
      ai_status?: string;
      search?: string;
    };

    let sql = `
      SELECT t.id, t.client_workspace_id, t.agent_id, t.subject, t.customer_email, 
             t.customer_name, t.status, t.ai_status, t.last_message_at, t.created_at,
             a.name as agent_name,
             (SELECT body_text FROM mailbox_messages WHERE thread_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message_preview,
             (SELECT COUNT(*)::int FROM mailbox_messages WHERE thread_id = t.id) as message_count,
             (SELECT COUNT(*)::int FROM copilot_drafts WHERE thread_id = t.id AND status = 'pending') as pending_drafts_count
      FROM mailbox_threads t
      LEFT JOIN agents a ON t.agent_id = a.id
      WHERE t.client_workspace_id = $1
    `;
    const params: any[] = [wsId];

    if (status !== 'all') {
      params.push(status);
      sql += ` AND t.status = $${params.length}`;
    }

    if (ai_status !== 'all') {
      params.push(ai_status);
      sql += ` AND t.ai_status = $${params.length}`;
    }

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      sql += ` AND (LOWER(t.subject) LIKE $${params.length} OR LOWER(t.customer_email) LIKE $${params.length} OR LOWER(COALESCE(t.customer_name, '')) LIKE $${params.length})`;
    }

    sql += ` ORDER BY t.last_message_at DESC`;

    const result = await query(sql, params);
    return res.json(result.rows);
  })
);

// GET /api/v1/workspaces/:wsId/mailbox/threads/:threadId - Get thread details & message history
router.get(
  '/workspaces/:wsId/mailbox/threads/:threadId',
  authenticateAgency,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { wsId, threadId } = req.params;
    const agencyId = req.agencyId!;
    await assertWorkspaceBelongsToAgency(wsId, agencyId);

    const data = await getThreadDetails(threadId);
    if (data.thread.client_workspace_id !== wsId) {
      return res.status(403).json({ error: 'Thread does not belong to this workspace' });
    }

    return res.json(data);
  })
);

// POST /api/v1/workspaces/:wsId/mailbox/threads/:threadId/reply - Send human or approved draft reply
router.post(
  '/workspaces/:wsId/mailbox/threads/:threadId/reply',
  authenticateAgency,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { wsId, threadId } = req.params;
    const agencyId = req.agencyId!;
    await assertWorkspaceBelongsToAgency(wsId, agencyId);

    const { reply_text, draft_id, sender_name, close_thread } = req.body;

    if (!reply_text || !reply_text.trim()) {
      return res.status(400).json({ error: 'Reply text cannot be empty' });
    }

    const result = await sendThreadReply(threadId, reply_text.trim(), {
      senderName: sender_name,
      draftId: draft_id,
      closeThread: close_thread === true,
    });

    return res.json(result);
  })
);

// PATCH /api/v1/workspaces/:wsId/mailbox/threads/:threadId - Update thread status or agent
router.patch(
  '/workspaces/:wsId/mailbox/threads/:threadId',
  authenticateAgency,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { wsId, threadId } = req.params;
    const agencyId = req.agencyId!;
    await assertWorkspaceBelongsToAgency(wsId, agencyId);

    const { status, agent_id } = req.body;

    if (status && !['open', 'pending', 'resolved', 'closed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (status) {
      values.push(status);
      updates.push(`status = $${values.length}`);
    }

    if (agent_id !== undefined) {
      values.push(agent_id || null);
      updates.push(`agent_id = $${values.length}`);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(threadId);
    values.push(wsId);

    const updateSql = `
      UPDATE mailbox_threads 
      SET ${updates.join(', ')}, updated_at = NOW() 
      WHERE id = $${values.length - 1} AND client_workspace_id = $${values.length} 
      RETURNING *
    `;

    const result = await query(updateSql, values);
    if (!result.rowCount || result.rowCount === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    return res.json(result.rows[0]);
  })
);

// GET /api/v1/workspaces/:wsId/mailbox/settings - Get mailbox configuration
router.get(
  '/workspaces/:wsId/mailbox/settings',
  authenticateAgency,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { wsId } = req.params;
    const agencyId = req.agencyId!;
    await assertWorkspaceBelongsToAgency(wsId, agencyId);

    const result = await query(
      `SELECT id, client_name, mailbox_support_email, mailbox_forwarding_address,
              mailbox_mode, mailbox_auto_threshold, mailbox_assigned_agent_id
       FROM client_workspaces 
       WHERE id = $1`,
      [wsId]
    );

    if (!result.rowCount || result.rowCount === 0) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const row = result.rows[0];
    // Default forwarding address if not set
    const defaultForwarding = row.mailbox_forwarding_address || `inbound+${wsId}@mail.formaai.com`;

    return res.json({
      ...row,
      mailbox_forwarding_address: defaultForwarding,
    });
  })
);

// PUT /api/v1/workspaces/:wsId/mailbox/settings - Update mailbox configuration
router.put(
  '/workspaces/:wsId/mailbox/settings',
  authenticateAgency,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { wsId } = req.params;
    const agencyId = req.agencyId!;
    await assertWorkspaceBelongsToAgency(wsId, agencyId);

    const {
      mailbox_support_email,
      mailbox_forwarding_address,
      mailbox_mode = 'copilot',
      mailbox_auto_threshold = 0.75,
      mailbox_assigned_agent_id,
    } = req.body;

    if (!['autonomous', 'copilot', 'manual'].includes(mailbox_mode)) {
      return res.status(400).json({ error: 'Invalid mailbox_mode. Must be autonomous, copilot, or manual.' });
    }

    const updateRes = await query(
      `UPDATE client_workspaces 
       SET mailbox_support_email = $1,
           mailbox_forwarding_address = $2,
           mailbox_mode = $3,
           mailbox_auto_threshold = $4,
           mailbox_assigned_agent_id = $5
       WHERE id = $6
       RETURNING id, client_name, mailbox_support_email, mailbox_forwarding_address, mailbox_mode, mailbox_auto_threshold, mailbox_assigned_agent_id`,
      [
        mailbox_support_email || null,
        mailbox_forwarding_address || `inbound+${wsId}@mail.formaai.com`,
        mailbox_mode,
        mailbox_auto_threshold,
        mailbox_assigned_agent_id || null,
        wsId,
      ]
    );

    return res.json(updateRes.rows[0]);
  })
);

// POST /api/v1/workspaces/:wsId/mailbox/simulate - Simulator for interactive testing from dashboard
router.post(
  '/workspaces/:wsId/mailbox/simulate',
  authenticateAgency,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { wsId } = req.params;
    const agencyId = req.agencyId!;
    await assertWorkspaceBelongsToAgency(wsId, agencyId);

    const { customer_name, customer_email, subject, message } = req.body;

    if (!customer_email || !message) {
      return res.status(400).json({ error: 'customer_email and message are required' });
    }

    const fromFormatted = customer_name ? `"${customer_name}" <${customer_email}>` : customer_email;

    const result = await processInboundEmail({
      workspaceId: wsId,
      to: `inbound+${wsId}@mail.formaai.com`,
      from: fromFormatted,
      subject: subject || 'Support Question',
      text: message,
    });

    return res.status(201).json({
      success: true,
      simulation: true,
      ...result,
    });
  })
);

export default router;
