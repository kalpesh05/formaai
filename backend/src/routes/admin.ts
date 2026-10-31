import { Router, Response, NextFunction } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import pool, { query } from '../config/db';
import { AuthenticatedRequest, authenticateAgency, requireSuperAdmin } from '../middleware/auth';
import { TEMPLATES } from '../config/templates';
import { PLANS } from '../config/plans';
import { syncPlanWithGateways } from '../services/paymentGateway';

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

  const autofixRes = await query(`
    SELECT 
      COUNT(*)::int as total_prs,
      COUNT(CASE WHEN status = 'open' THEN 1 END)::int as open_prs,
      COUNT(CASE WHEN status = 'merged' THEN 1 END)::int as merged_prs
    FROM autofix_prs
  `);

  const formsRes = await query(`
    SELECT 
      (SELECT COUNT(*)::int FROM forms) as total_forms,
      (SELECT COUNT(*)::int FROM form_submissions) as total_submissions
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
      total_autofix_prs: autofixRes.rows[0]?.total_prs || 0,
      open_autofix_prs: autofixRes.rows[0]?.open_prs || 0,
      merged_autofix_prs: autofixRes.rows[0]?.merged_prs || 0,
      total_forms: formsRes.rows[0]?.total_forms || 0,
      total_form_submissions: formsRes.rows[0]?.total_submissions || 0,
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
    billing_interval,
    subscription_status,
    trial_ends_at,
    extend_trial_days,
    admin_notes,
    feature_flags,
  } = req.body;

  if (extend_trial_days && typeof extend_trial_days === 'number') {
    await query(
      `UPDATE client_workspaces
       SET trial_ends_at = GREATEST(COALESCE(trial_ends_at, now()), now()) + ($1 || ' days')::interval,
           subscription_status = 'trialing'
       WHERE id = $2`,
      [extend_trial_days, id]
    );
  }

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
         billing_interval = COALESCE($9, billing_interval),
         subscription_status = COALESCE($10, subscription_status),
         trial_ends_at = COALESCE($11, trial_ends_at),
         admin_notes = COALESCE($12, admin_notes),
         feature_flags = COALESCE($13, feature_flags)
     WHERE id = $14
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
      billing_interval ?? null,
      subscription_status ?? null,
      trial_ends_at ?? null,
      admin_notes ?? null,
      feature_flags ? JSON.stringify(feature_flags) : null,
      id,
    ]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Customer workspace not found' });
  }

  // Ensure workspace_subscriptions and limits stay in sync when admin modifies plan tier or status
  if (plan_tier || subscription_status) {
    try {
      const activeTier = (plan_tier || result.rows[0].plan_tier || 'trial').toLowerCase();
      const planRes = await query('SELECT * FROM subscription_plans WHERE id = $1', [activeTier]);
      const planData = planRes.rows[0] || (PLANS as any)[activeTier];

      if (planData) {
        const existingSub = await query(
          'SELECT id FROM workspace_subscriptions WHERE workspace_id = $1 AND status = $2',
          [id, 'active']
        );

        if (existingSub.rows.length > 0) {
          await query(
            `UPDATE workspace_subscriptions
             SET plan_id = $1,
                 plan_snapshot = $2,
                 status = COALESCE($3, status),
                 updated_at = now()
             WHERE workspace_id = $4 AND status = 'active'`,
            [
              activeTier,
              JSON.stringify(planData),
              subscription_status ?? null,
              id,
            ]
          );
        } else if (subscription_status === 'active') {
          // Admin manually activated this workspace for collaboration or testing
          await query(
            `INSERT INTO workspace_subscriptions (
               workspace_id, plan_id, provider, status, billing_interval, locked_price, plan_snapshot
             ) VALUES (
               $1, $2, 'manual_admin', 'active', $3, $4, $5
             )`,
            [
              id,
              activeTier,
              billing_interval || result.rows[0].billing_interval || 'monthly',
              planData.monthly_price ?? planData.monthlyPrice ?? 0,
              JSON.stringify(planData),
            ]
          );
        }
      }
    } catch (subErr) {
      console.warn('[ADMIN] Could not sync workspace_subscriptions on customer update:', subErr);
    }
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

/**
 * GET /api/v1/admin/platform/modules
 * Get global module release states (internal, beta, live)
 */
router.get('/platform/modules', asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const { getGlobalModuleLifecycle } = await import('../utils/planLimits');
  const modules = await getGlobalModuleLifecycle();
  return res.json({ modules });
}));

/**
 * PATCH /api/v1/admin/platform/modules
 * Update release stage and minimum plan for a module
 */
router.patch('/platform/modules', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { module_key, status, min_plan, name, description } = req.body;
  if (!module_key) {
    return res.status(400).json({ error: 'module_key is required' });
  }

  const { getGlobalModuleLifecycle } = await import('../utils/planLimits');
  const currentModules = await getGlobalModuleLifecycle();
  if (!currentModules[module_key]) {
    return res.status(404).json({ error: `Unknown module key: ${module_key}` });
  }

  const updatedConfig = {
    ...currentModules[module_key],
    ...(status ? { status } : {}),
    ...(min_plan ? { min_plan } : {}),
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
  };

  currentModules[module_key] = updatedConfig;

  await query(
    `INSERT INTO platform_settings (key, value, updated_at)
     VALUES ('module_lifecycle', $1, now())
     ON CONFLICT (key) DO UPDATE
     SET value = $1, updated_at = now()`,
    [JSON.stringify(currentModules)]
  );

  return res.json({ success: true, modules: currentModules });
}));

/**
 * ── DYNAMIC PLAN MANAGEMENT & PAYMENT GATEWAY SYNC ──
 */

/**
 * GET /api/v1/admin/plans
 * Returns all configured plans from the database with active subscriber counts and MRR
 */
router.get('/plans', asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const plansRes = await query(`
    SELECT sp.*,
           COUNT(cw.id)::int as total_workspaces,
           COUNT(CASE WHEN cw.subscription_status = 'active' THEN 1 END)::int as active_subscribers,
           COALESCE(SUM(CASE 
             WHEN cw.subscription_status = 'active' AND cw.billing_interval = 'yearly' THEN sp.yearly_monthly_price
             WHEN cw.subscription_status = 'active' THEN sp.monthly_price
             ELSE 0
           END), 0)::numeric as estimated_mrr
    FROM subscription_plans sp
    LEFT JOIN client_workspaces cw ON cw.plan_tier = sp.id
    GROUP BY sp.id
    ORDER BY sp.rank ASC, sp.monthly_price ASC
  `);

  return res.json(plansRes.rows);
}));

/**
 * POST /api/v1/admin/plans
 * Creates a new plan, synchronizes with Stripe & Razorpay, and inserts into DB
 */
router.post('/plans', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const {
    id,
    name,
    tagline,
    monthly_price = 0,
    yearly_monthly_price = 0,
    currency = 'usd',
    max_agents = 1,
    monthly_message_limit = 1000,
    max_forms = 0,
    max_ingest_urls = 20,
    white_label = false,
    custom_colors = false,
    payment_provider = 'stripe',
    rank = 1,
    highlight = false,
    is_public = true,
  } = req.body;

  if (!id || !name) {
    return res.status(400).json({ error: 'id and name are required' });
  }

  // Clean slug format
  const cleanId = id.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '_');

  // Check if plan ID already exists
  const existing = await query('SELECT id FROM subscription_plans WHERE id = $1', [cleanId]);
  if (existing.rows.length > 0) {
    return res.status(400).json({ error: `Plan with ID '${cleanId}' already exists.` });
  }

  // Synchronize with selected payment gateways
  const syncResult = await syncPlanWithGateways({
    id: cleanId,
    name,
    tagline,
    monthly_price: Number(monthly_price),
    yearly_monthly_price: Number(yearly_monthly_price),
    currency,
    payment_provider,
  });

  const insertRes = await query(
    `INSERT INTO subscription_plans (
      id, name, tagline, monthly_price, yearly_monthly_price, currency,
      max_agents, monthly_message_limit, max_forms, max_ingest_urls,
      white_label, custom_colors, rank, highlight, is_public, payment_provider,
      stripe_product_id, stripe_price_monthly_id, stripe_price_yearly_id,
      razorpay_plan_monthly_id, razorpay_plan_yearly_id
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16,
      $17, $18, $19,
      $20, $21
    ) RETURNING *`,
    [
      cleanId, name, tagline || null, Number(monthly_price), Number(yearly_monthly_price), currency,
      Number(max_agents), Number(monthly_message_limit), Number(max_forms), Number(max_ingest_urls),
      Boolean(white_label), Boolean(custom_colors), Number(rank), Boolean(highlight), Boolean(is_public), payment_provider,
      syncResult.stripe_product_id || null, syncResult.stripe_price_monthly_id || null, syncResult.stripe_price_yearly_id || null,
      syncResult.razorpay_plan_monthly_id || null, syncResult.razorpay_plan_yearly_id || null
    ]
  );

  return res.status(201).json({
    plan: insertRes.rows[0],
    sync_logs: syncResult.sync_logs,
  });
}));

/**
 * PUT /api/v1/admin/plans/:id
 * Updates an existing plan.
 * Handles pricing adjustments with optional Grandfathering:
 * - grandfather_existing: true (Default) -> preserves locked price & limits for all existing active subscribers.
 * - grandfather_existing: false -> immediately elevates existing subscribers to new limits and scheduled rate.
 */
router.put('/plans/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const planId = req.params.id;
  const {
    name,
    tagline,
    monthly_price,
    yearly_monthly_price,
    currency = 'usd',
    max_agents,
    monthly_message_limit,
    max_forms,
    max_ingest_urls,
    white_label,
    custom_colors,
    payment_provider = 'stripe',
    rank,
    highlight,
    is_public,
    is_active,
    grandfather_existing = true, // By default protect existing customers
  } = req.body;

  const currentRes = await query('SELECT * FROM subscription_plans WHERE id = $1', [planId]);
  if (currentRes.rows.length === 0) {
    return res.status(404).json({ error: `Plan '${planId}' not found.` });
  }
  const currentPlan = currentRes.rows[0];

  const priceChanged =
    (monthly_price !== undefined && Number(monthly_price) !== Number(currentPlan.monthly_price)) ||
    (yearly_monthly_price !== undefined && Number(yearly_monthly_price) !== Number(currentPlan.yearly_monthly_price));

  // If price changed or gateway provider changed, sync with gateways to generate new price IDs
  let syncResult: any = {};
  if (priceChanged || payment_provider !== currentPlan.payment_provider) {
    syncResult = await syncPlanWithGateways({
      id: planId,
      name: name || currentPlan.name,
      tagline: tagline || currentPlan.tagline,
      monthly_price: monthly_price !== undefined ? Number(monthly_price) : Number(currentPlan.monthly_price),
      yearly_monthly_price: yearly_monthly_price !== undefined ? Number(yearly_monthly_price) : Number(currentPlan.yearly_monthly_price),
      currency,
      payment_provider,
      stripe_product_id: currentPlan.stripe_product_id,
    });
  }

  // Update subscription_plans table
  const updatedRes = await query(
    `UPDATE subscription_plans
     SET name = COALESCE($1, name),
         tagline = COALESCE($2, tagline),
         monthly_price = COALESCE($3, monthly_price),
         yearly_monthly_price = COALESCE($4, yearly_monthly_price),
         currency = COALESCE($5, currency),
         max_agents = COALESCE($6, max_agents),
         monthly_message_limit = COALESCE($7, monthly_message_limit),
         max_forms = COALESCE($8, max_forms),
         max_ingest_urls = COALESCE($9, max_ingest_urls),
         white_label = COALESCE($10, white_label),
         custom_colors = COALESCE($11, custom_colors),
         payment_provider = COALESCE($12, payment_provider),
         rank = COALESCE($13, rank),
         highlight = COALESCE($14, highlight),
         is_public = COALESCE($15, is_public),
         is_active = COALESCE($16, is_active),
         stripe_price_monthly_id = COALESCE($17, stripe_price_monthly_id),
         stripe_price_yearly_id = COALESCE($18, stripe_price_yearly_id),
         razorpay_plan_monthly_id = COALESCE($19, razorpay_plan_monthly_id),
         razorpay_plan_yearly_id = COALESCE($20, razorpay_plan_yearly_id),
         updated_at = now()
     WHERE id = $21
     RETURNING *`,
    [
      name ?? null, tagline ?? null,
      monthly_price !== undefined ? Number(monthly_price) : null,
      yearly_monthly_price !== undefined ? Number(yearly_monthly_price) : null,
      currency ?? null,
      max_agents !== undefined ? Number(max_agents) : null,
      monthly_message_limit !== undefined ? Number(monthly_message_limit) : null,
      max_forms !== undefined ? Number(max_forms) : null,
      max_ingest_urls !== undefined ? Number(max_ingest_urls) : null,
      white_label !== undefined ? Boolean(white_label) : null,
      custom_colors !== undefined ? Boolean(custom_colors) : null,
      payment_provider ?? null,
      rank !== undefined ? Number(rank) : null,
      highlight !== undefined ? Boolean(highlight) : null,
      is_public !== undefined ? Boolean(is_public) : null,
      is_active !== undefined ? Boolean(is_active) : null,
      syncResult.stripe_price_monthly_id ?? null,
      syncResult.stripe_price_yearly_id ?? null,
      syncResult.razorpay_plan_monthly_id ?? null,
      syncResult.razorpay_plan_yearly_id ?? null,
      planId
    ]
  );

  let affectedSubscribersCount = 0;
  // If admin chooses NOT to grandfather, update all active subscribers to the new limits and new price
  if (!grandfather_existing && priceChanged) {
    const updatedPlan = updatedRes.rows[0];
    const updateSubs = await query(
      `UPDATE workspace_subscriptions
       SET locked_price = CASE WHEN billing_interval = 'yearly' THEN $1 ELSE $2 END,
           plan_snapshot = $3,
           updated_at = now()
       WHERE plan_id = $4 AND status = 'active'`,
      [
        updatedPlan.yearly_monthly_price,
        updatedPlan.monthly_price,
        JSON.stringify(updatedPlan),
        planId
      ]
    );
    affectedSubscribersCount = updateSubs.rowCount || 0;
  }

  return res.json({
    success: true,
    plan: updatedRes.rows[0],
    price_changed: priceChanged,
    grandfathered: grandfather_existing,
    subscribers_migrated: affectedSubscribersCount,
    sync_logs: syncResult.sync_logs || [],
  });
}));

/**
 * DELETE /api/v1/admin/plans/:id
 * Soft deletes / deactivates a plan so existing subscribers are never broken
 */
router.delete('/plans/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const planId = req.params.id;
  await query('UPDATE subscription_plans SET is_active = false, is_public = false, updated_at = now() WHERE id = $1', [planId]);
  return res.json({ success: true, message: `Plan '${planId}' deactivated successfully.` });
}));

/**
 * GET /api/v1/admin/subscriptions
 * Retrieves all paying customers, their locked price vs current plan price,
 * grandfathering status, next renewal date, and transaction receipts.
 */
router.get('/subscriptions', asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  const subsRes = await query(`
    SELECT 
      cw.id as workspace_id,
      cw.name as workspace_name,
      cw.industry,
      cw.plan_tier,
      cw.subscription_status,
      cw.billing_interval,
      cw.trial_ends_at,
      a.email as owner_email,
      a.name as owner_name,
      sp.name as plan_name,
      sp.monthly_price as current_monthly_price,
      sp.yearly_monthly_price as current_yearly_price,
      ws.id as subscription_uuid,
      ws.provider,
      ws.subscription_id,
      ws.locked_price,
      ws.current_period_end,
      ws.cancel_at_period_end,
      ws.created_at as subscribed_at,
      CASE 
        WHEN ws.locked_price IS NOT NULL AND ws.locked_price < (
          CASE WHEN cw.billing_interval = 'yearly' THEN sp.yearly_monthly_price ELSE sp.monthly_price END
        ) THEN true
        ELSE false
      END as is_grandfathered
    FROM client_workspaces cw
    LEFT JOIN agencies a ON a.id = cw.agency_id
    LEFT JOIN subscription_plans sp ON sp.id = cw.plan_tier
    LEFT JOIN workspace_subscriptions ws ON ws.workspace_id = cw.id AND ws.status = 'active'
    ORDER BY ws.created_at DESC NULLS LAST, cw.created_at DESC
  `);

  return res.json(subsRes.rows);
}));

/**
 * POST /api/v1/admin/subscriptions/:workspaceId/migrate
 * Manually or bulk-migrates a grandfathered subscriber to the latest plan rates & limits
 */
router.post('/subscriptions/:workspaceId/migrate', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { workspaceId } = req.params;

  const wsRes = await query('SELECT id, plan_tier, billing_interval FROM client_workspaces WHERE id = $1', [workspaceId]);
  if (wsRes.rows.length === 0) {
    return res.status(404).json({ error: 'Workspace not found' });
  }

  const ws = wsRes.rows[0];
  const planRes = await query('SELECT * FROM subscription_plans WHERE id = $1', [ws.plan_tier]);
  if (planRes.rows.length === 0) {
    return res.status(404).json({ error: 'Associated plan not found' });
  }

  const latestPlan = planRes.rows[0];
  const newPrice = ws.billing_interval === 'yearly' ? latestPlan.yearly_monthly_price : latestPlan.monthly_price;

  await query(
    `INSERT INTO workspace_subscriptions (
       workspace_id, plan_id, provider, status, billing_interval, locked_price, plan_snapshot
     ) VALUES (
       $1, $2, $3, 'active', $4, $5, $6
     )
     ON CONFLICT (id) DO NOTHING`,
    [
      workspaceId,
      ws.plan_tier,
      latestPlan.payment_provider || 'stripe',
      ws.billing_interval || 'monthly',
      newPrice,
      JSON.stringify(latestPlan)
    ]
  );

  await query(
    `UPDATE workspace_subscriptions
     SET locked_price = $1,
         plan_snapshot = $2,
         updated_at = now()
     WHERE workspace_id = $3 AND status = 'active'`,
    [newPrice, JSON.stringify(latestPlan), workspaceId]
  );

  return res.json({
    success: true,
    message: `Workspace successfully migrated to latest ${latestPlan.name} price (\$${newPrice})`,
    new_price: newPrice,
  });
}));

export default router;
