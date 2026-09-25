import { Router, Response, NextFunction } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import pool, { query } from '../config/db';
import { AuthenticatedRequest, authenticateAgency, requireSuperAdmin } from '../middleware/auth';
import { TEMPLATES } from '../config/templates';

const router = Router();

const asyncHandler = (fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

// All admin endpoints require authentication and Super Admin privileges
router.use(authenticateAgency);
router.use(requireSuperAdmin);

/**
 * GET /api/v1/admin/stats
 * Returns platform-wide KPIs and recent activity for the Product Owner
 */
router.get('/stats', asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  // Aggregate platform metrics
  const clientsRes = await query('SELECT COUNT(*)::int as count FROM client_workspaces');
  const agentsRes = await query('SELECT COUNT(*)::int as count, COUNT(CASE WHEN status = \'live\' THEN 1 END)::int as live_count FROM agents');
  const convRes = await query('SELECT COUNT(*)::int as count FROM conversations');
  const msgRes = await query('SELECT COUNT(*)::int as count FROM messages');
  const ticketRes = await query('SELECT COUNT(*)::int as count, COUNT(CASE WHEN status = \'open\' THEN 1 END)::int as open_count FROM tickets');
  const actionsRes = await query(`
    SELECT 
      COUNT(*)::int as total_actions,
      COUNT(CASE WHEN action_type = 'calendar_booking' AND status = 'success' THEN 1 END)::int as total_bookings,
      COUNT(CASE WHEN status = 'failed' THEN 1 END)::int as failed_actions
    FROM action_logs
  `);

  // Status breakdown of workspaces
  const statusRes = await query(`
    SELECT onboarding_status, COUNT(*)::int as count
    FROM client_workspaces
    GROUP BY onboarding_status
  `);

  // Recent system activity across all workspaces
  const recentLogsRes = await query(`
    SELECT l.id, l.action_type, l.status, l.created_at,
           a.name as agent_name, cw.client_name, cw.id as workspace_id
    FROM action_logs l
    JOIN agents a ON l.agent_id = a.id
    JOIN client_workspaces cw ON a.client_workspace_id = cw.id
    ORDER BY l.created_at DESC
    LIMIT 8
  `);

  return res.json({
    kpis: {
      total_clients: clientsRes.rows[0]?.count || 0,
      total_agents: agentsRes.rows[0]?.count || 0,
      live_agents: agentsRes.rows[0]?.live_count || 0,
      total_conversations: convRes.rows[0]?.count || 0,
      total_messages: msgRes.rows[0]?.count || 0,
      total_tickets: ticketRes.rows[0]?.count || 0,
      open_tickets: ticketRes.rows[0]?.open_count || 0,
      total_bookings: actionsRes.rows[0]?.total_bookings || 0,
      total_actions: actionsRes.rows[0]?.total_actions || 0,
      failed_actions: actionsRes.rows[0]?.failed_actions || 0,
    },
    pipeline_breakdown: statusRes.rows,
    recent_activity: recentLogsRes.rows,
  });
}));

/**
 * GET /api/v1/admin/customers
 * Returns all client customers with detailed CRM metadata, bot counts, and usage
 */
router.get('/customers', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { search, status, tier } = req.query;

  let queryText = `
    SELECT 
      cw.id,
      cw.client_name,
      cw.contact_name,
      cw.contact_email,
      cw.contact_phone,
      cw.website_url,
      cw.industry,
      cw.onboarding_status,
      cw.plan_tier,
      cw.admin_notes,
      cw.created_at,
      COALESCE(COUNT(DISTINCT a.id), 0)::int as agent_count,
      COALESCE(COUNT(DISTINCT CASE WHEN a.status = 'live' THEN a.id END), 0)::int as live_agent_count,
      COALESCE(COUNT(DISTINCT c.id), 0)::int as conversation_count,
      COALESCE(COUNT(DISTINCT t.id), 0)::int as ticket_count,
      MAX(c.created_at) as last_conversation_at
    FROM client_workspaces cw
    LEFT JOIN agents a ON cw.id = a.client_workspace_id
    LEFT JOIN conversations c ON a.id = c.agent_id
    LEFT JOIN tickets t ON a.id = t.agent_id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (search && typeof search === 'string' && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    queryText += ` AND (LOWER(cw.client_name) LIKE $${params.length} OR LOWER(COALESCE(cw.contact_email, '')) LIKE $${params.length} OR LOWER(COALESCE(cw.website_url, '')) LIKE $${params.length})`;
  }

  if (status && typeof status === 'string' && status !== 'all') {
    params.push(status);
    queryText += ` AND cw.onboarding_status = $${params.length}`;
  }

  if (tier && typeof tier === 'string' && tier !== 'all') {
    params.push(tier);
    queryText += ` AND cw.plan_tier = $${params.length}`;
  }

  queryText += `
    GROUP BY cw.id
    ORDER BY cw.created_at DESC
  `;

  const result = await query(queryText, params);
  return res.json(result.rows);
}));

/**
 * POST /api/v1/admin/customers
 * Concierge onboarding: Create customer profile, optionally spin up their first agent and tools
 */
router.post('/customers', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const {
    client_name,
    contact_name,
    contact_email,
    contact_phone,
    website_url,
    industry,
    plan_tier = 'growth',
    onboarding_status = 'requested',
    admin_notes,
    initial_agent_template, // 'support' | 'sales'
    initial_agent_name,
    create_login_credentials,
    login_email,
    temp_password,
  } = req.body;

  if (!client_name) {
    return res.status(400).json({ error: 'Client/Company name is required' });
  }

  const agencyId = req.agencyId!;

  const clientConn = await pool.connect();
  try {
    await clientConn.query('BEGIN');

    // If client login credentials requested, provision user account for client
    let targetAgencyId = agencyId;
    let credentials = null;

    if (create_login_credentials && (login_email || contact_email) && temp_password) {
      const emailToUse = (login_email || contact_email).trim().toLowerCase();
      const existingUser = await clientConn.query('SELECT id FROM agencies WHERE email = $1', [emailToUse]);
      
      if (existingUser.rowCount && existingUser.rowCount > 0) {
        targetAgencyId = existingUser.rows[0].id;
      } else {
        const hash = await bcrypt.hash(temp_password, 10);
        const userInsert = await clientConn.query(
          `INSERT INTO agencies (name, email, password_hash, role)
           VALUES ($1, $2, $3, 'agency_user')
           RETURNING id, name, email, role, created_at`,
          [client_name, emailToUse, hash]
        );
        targetAgencyId = userInsert.rows[0].id;
      }

      credentials = {
        email: emailToUse,
        temp_password: temp_password,
      };
    }

    // 1. Create client workspace with full CRM metadata
    const wsResult = await clientConn.query(
      `INSERT INTO client_workspaces (
         agency_id, client_name, contact_name, contact_email, contact_phone,
         website_url, industry, onboarding_status, plan_tier, admin_notes
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        targetAgencyId,
        client_name,
        contact_name || null,
        contact_email || null,
        contact_phone || null,
        website_url || null,
        industry || null,
        onboarding_status,
        plan_tier,
        admin_notes || null,
      ]
    );

    const workspace = wsResult.rows[0];
    let agent = null;

    // 2. Optionally spin up first agent if template chosen
    if (initial_agent_template && (initial_agent_template === 'support' || initial_agent_template === 'sales')) {
      const preset = TEMPLATES[initial_agent_template as 'support' | 'sales'];
      const agentName = initial_agent_name || `${client_name} ${initial_agent_template === 'sales' ? 'Sales Rep' : 'Support Assistant'}`;

      const agentResult = await clientConn.query(
        `INSERT INTO agents (client_workspace_id, template_type, name, llm_provider, llm_model, config, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'draft')
         RETURNING *`,
        [workspace.id, initial_agent_template, agentName, preset.llm_provider, preset.llm_model, JSON.stringify(preset.config)]
      );
      agent = agentResult.rows[0];

      // Add default tools
      for (const tool of preset.tools) {
        await clientConn.query(
          `INSERT INTO agent_tools (agent_id, tool_type, tool_config, enabled)
           VALUES ($1, $2, $3, true)`,
          [agent.id, tool.tool_type, JSON.stringify(tool.tool_config)]
        );
      }
    }

    await clientConn.query('COMMIT');
    return res.status(201).json({ workspace, agent, credentials });
  } catch (error) {
    await clientConn.query('ROLLBACK');
    throw error;
  } finally {
    clientConn.release();
  }
}));

/**
 * GET /api/v1/admin/customers/:id
 * Customer 360 overview: Workspace info, all agents, tools, active data sources, and ticket summaries
 */
router.get('/customers/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  const wsResult = await query(
    `SELECT cw.*,
            COALESCE(COUNT(DISTINCT a.id), 0)::int as agent_count,
            COALESCE(COUNT(DISTINCT c.id), 0)::int as conversation_count,
            COALESCE(COUNT(DISTINCT t.id), 0)::int as ticket_count
     FROM client_workspaces cw
     LEFT JOIN agents a ON cw.id = a.client_workspace_id
     LEFT JOIN conversations c ON a.id = c.agent_id
     LEFT JOIN tickets t ON a.id = t.agent_id
     WHERE cw.id = $1
     GROUP BY cw.id`,
    [id]
  );

  if (wsResult.rowCount === 0) {
    return res.status(404).json({ error: 'Customer workspace not found' });
  }

  const customer = wsResult.rows[0];

  // Fetch all agents under this customer
  const agentsResult = await query(
    `SELECT a.id, a.name, a.template_type, a.status, a.llm_provider, a.llm_model, a.api_key, a.created_at,
            COALESCE(COUNT(DISTINCT ds.id), 0)::int as data_source_count,
            COALESCE(COUNT(DISTINCT at.id), 0)::int as tool_count
     FROM agents a
     LEFT JOIN data_sources ds ON a.id = ds.agent_id
     LEFT JOIN agent_tools at ON a.id = at.agent_id
     WHERE a.client_workspace_id = $1
     GROUP BY a.id
     ORDER BY a.created_at DESC`,
    [id]
  );

  // Fetch recent tickets
  const ticketsResult = await query(
    `SELECT t.id, t.subject, t.status, t.created_at, a.name as agent_name
     FROM tickets t
     JOIN agents a ON t.agent_id = a.id
     WHERE a.client_workspace_id = $1
     ORDER BY t.created_at DESC
     LIMIT 5`,
    [id]
  );

  return res.json({
    customer,
    agents: agentsResult.rows,
    recent_tickets: ticketsResult.rows,
  });
}));

/**
 * PATCH /api/v1/admin/customers/:id
 * Update customer CRM details, notes, onboarding stage, and plan
 */
router.patch('/customers/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const {
    client_name,
    contact_name,
    contact_email,
    contact_phone,
    website_url,
    industry,
    onboarding_status,
    plan_tier,
    admin_notes,
  } = req.body;

  const result = await query(
    `UPDATE client_workspaces
     SET client_name = COALESCE($1, client_name),
         contact_name = COALESCE($2, contact_name),
         contact_email = COALESCE($3, contact_email),
         contact_phone = COALESCE($4, contact_phone),
         website_url = COALESCE($5, website_url),
         industry = COALESCE($6, industry),
         onboarding_status = COALESCE($7, onboarding_status),
         plan_tier = COALESCE($8, plan_tier),
         admin_notes = COALESCE($9, admin_notes)
     WHERE id = $10
     RETURNING *`,
    [
      client_name ?? null,
      contact_name ?? null,
      contact_email ?? null,
      contact_phone ?? null,
      website_url ?? null,
      industry ?? null,
      onboarding_status ?? null,
      plan_tier ?? null,
      admin_notes ?? null,
      id,
    ]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Customer workspace not found' });
  }

  return res.json(result.rows[0]);
}));

/**
 * POST /api/v1/admin/customers/:id/agents/:agentId/deploy
 * Deploy an agent on behalf of the customer: generates API key and sets status to 'live'
 */
router.post('/customers/:id/agents/:agentId/deploy', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id, agentId } = req.params;

  // Verify agent belongs to this workspace
  const agentCheck = await query(
    'SELECT id, name FROM agents WHERE id = $1 AND client_workspace_id = $2',
    [agentId, id]
  );
  if (agentCheck.rowCount === 0) {
    return res.status(404).json({ error: 'Agent not found in this customer workspace' });
  }

  // Generate cryptographically secure client widget API token with fa_live_ prefix
  const rawKey = crypto.randomBytes(24).toString('hex');
  const apiKey = `fa_live_${rawKey}`;

  const result = await query(
    `UPDATE agents
     SET status = 'live', api_key = $1
     WHERE id = $2
     RETURNING id, name, status, api_key`,
    [apiKey, agentId]
  );

  // Automatically transition onboarding status to 'live' if not already
  await query(
    `UPDATE client_workspaces
     SET onboarding_status = 'live'
     WHERE id = $1 AND onboarding_status IN ('requested', 'configuring', 'ready_for_review')`,
    [id]
  );

  return res.json(result.rows[0]);
}));


/**
 * GET /api/v1/admin/customers/:id/analytics
 * Deep analytics for this specific customer: daily volume, action results, message breakdown
 */
router.get('/customers/:id/analytics', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  // Verify workspace exists
  const check = await query('SELECT client_name FROM client_workspaces WHERE id = $1', [id]);
  if (check.rowCount === 0) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  // 1. Total chats & messages
  const summaryRes = await query(`
    SELECT 
      COUNT(DISTINCT c.id)::int as total_conversations,
      COUNT(DISTINCT m.id)::int as total_messages,
      COUNT(DISTINCT CASE WHEN m.role = 'user' THEN m.id END)::int as user_messages,
      COUNT(DISTINCT CASE WHEN m.role = 'assistant' THEN m.id END)::int as assistant_messages
    FROM agents a
    LEFT JOIN conversations c ON a.id = c.agent_id
    LEFT JOIN messages m ON c.id = m.conversation_id
    WHERE a.client_workspace_id = $1
  `, [id]);

  // 2. Action logs breakdown for this customer
  const actionsRes = await query(`
    SELECT 
      l.action_type,
      COUNT(*)::int as total,
      COUNT(CASE WHEN l.status = 'success' THEN 1 END)::int as success_count,
      COUNT(CASE WHEN l.status = 'failed' THEN 1 END)::int as failed_count
    FROM action_logs l
    JOIN agents a ON l.agent_id = a.id
    WHERE a.client_workspace_id = $1
    GROUP BY l.action_type
  `, [id]);

  // 3. Daily conversation volume (last 14 days)
  const volumeRes = await query(`
    SELECT 
      TO_CHAR(c.created_at, 'YYYY-MM-DD') as date,
      COUNT(DISTINCT c.id)::int as conversation_count,
      COUNT(DISTINCT m.id)::int as message_count
    FROM agents a
    JOIN conversations c ON a.id = c.agent_id
    LEFT JOIN messages m ON c.id = m.conversation_id
    WHERE a.client_workspace_id = $1
      AND c.created_at >= NOW() - INTERVAL '14 days'
    GROUP BY TO_CHAR(c.created_at, 'YYYY-MM-DD')
    ORDER BY date ASC
  `, [id]);

  // 4. Recent user queries (sample of user questions to see what customers are asking)
  const queriesRes = await query(`
    SELECT m.content, m.created_at, a.name as agent_name
    FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    JOIN agents a ON c.agent_id = a.id
    WHERE a.client_workspace_id = $1 AND m.role = 'user'
    ORDER BY m.created_at DESC
    LIMIT 10
  `, [id]);

  return res.json({
    summary: summaryRes.rows[0] || {
      total_conversations: 0,
      total_messages: 0,
      user_messages: 0,
      assistant_messages: 0,
    },
    actions: actionsRes.rows,
    daily_volume: volumeRes.rows,
    recent_user_questions: queriesRes.rows,
  });
}));

/**
 * GET /api/v1/admin/customers/:id/conversations
 * Searchable conversation history for diagnostics when customer reports an issue
 */
router.get('/customers/:id/conversations', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { search, limit = '25' } = req.query;

  let queryText = `
    SELECT 
      c.id,
      c.end_user_ref,
      c.created_at,
      a.id as agent_id,
      a.name as agent_name,
      a.template_type,
      COUNT(m.id)::int as message_count,
      (
        SELECT content FROM messages 
        WHERE conversation_id = c.id 
        ORDER BY created_at DESC LIMIT 1
      ) as last_message
    FROM conversations c
    JOIN agents a ON c.agent_id = a.id
    LEFT JOIN messages m ON c.id = m.conversation_id
    WHERE a.client_workspace_id = $1
  `;
  const params: any[] = [id];

  if (search && typeof search === 'string' && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    queryText += ` AND (LOWER(c.end_user_ref) LIKE $${params.length} OR EXISTS (
      SELECT 1 FROM messages sm 
      WHERE sm.conversation_id = c.id AND LOWER(sm.content) LIKE $${params.length}
    ))`;
  }

  queryText += `
    GROUP BY c.id, a.id, a.name, a.template_type
    ORDER BY c.created_at DESC
    LIMIT $${params.length + 1}
  `;
  params.push(Math.min(parseInt(limit as string, 10) || 25, 100));

  const result = await query(queryText, params);
  return res.json(result.rows);
}));

/**
 * GET /api/v1/admin/customers/:id/conversations/:conversationId
 * Detailed transcript inspector with all messages and relevant action logs for debugging
 */
router.get('/customers/:id/conversations/:conversationId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id, conversationId } = req.params;

  // Verify conversation belongs to this customer
  const convRes = await query(`
    SELECT c.id, c.end_user_ref, c.created_at, a.id as agent_id, a.name as agent_name, a.template_type, a.status
    FROM conversations c
    JOIN agents a ON c.agent_id = a.id
    WHERE c.id = $1 AND a.client_workspace_id = $2
  `, [conversationId, id]);

  if (convRes.rowCount === 0) {
    return res.status(404).json({ error: 'Conversation session not found for this customer' });
  }

  // Fetch full chronological message transcript
  const messagesRes = await query(`
    SELECT id, role, content, created_at
    FROM messages
    WHERE conversation_id = $1
    ORDER BY created_at ASC
  `, [conversationId]);

  // Fetch any action logs associated with this agent around this conversation
  const actionsRes = await query(`
    SELECT id, action_type, action_input, action_result, status, created_at
    FROM action_logs
    WHERE agent_id = $1
    ORDER BY created_at DESC
    LIMIT 10
  `, [convRes.rows[0].agent_id]);

  return res.json({
    conversation: convRes.rows[0],
    messages: messagesRes.rows,
    recent_agent_actions: actionsRes.rows,
  });
}));

export default router;
