import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest, authenticateAgency, assertWorkspaceBelongsToAgency } from '../middleware/auth';
import { query } from '../config/db';
import { resolveTicketWithAgent } from '../services/ticketResolver';

const router = Router();

const asyncHandler = (fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

// All workspace endpoints are protected by agency authentication
router.use(authenticateAgency);

// GET /api/v1/workspaces - List all client workspaces for the authenticated agency
router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const agencyId = req.agencyId;
  const result = await query(
    `SELECT cw.id, cw.client_name, cw.contact_name, cw.contact_email, cw.contact_phone,
            cw.website_url, cw.industry, cw.onboarding_status, cw.plan_tier, cw.admin_notes,
            COALESCE(cw.feature_flags, '{"forms": false, "mailbox": false, "tickets": false, "logs": false}'::jsonb) as feature_flags,
            cw.created_at, 
            COALESCE(COUNT(a.id), 0)::int as agent_count
     FROM client_workspaces cw
     LEFT JOIN agents a ON cw.id = a.client_workspace_id
     WHERE cw.agency_id = $1
     GROUP BY cw.id
     ORDER BY cw.created_at DESC`,
    [agencyId]
  );
  return res.json(result.rows);
}));

// POST /api/v1/workspaces - Create a new client workspace under the authenticated agency
router.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const {
    client_name,
    contact_name,
    contact_email,
    contact_phone,
    website_url,
    industry,
    onboarding_status = 'requested',
    plan_tier = 'growth',
    admin_notes,
  } = req.body;

  if (!client_name) {
    return res.status(400).json({ error: 'Client name is required' });
  }

  const agencyId = req.agencyId;
  const result = await query(
    `INSERT INTO client_workspaces (
       agency_id, client_name, contact_name, contact_email, contact_phone,
       website_url, industry, onboarding_status, plan_tier, admin_notes
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, client_name, contact_name, contact_email, contact_phone, website_url, industry, onboarding_status, plan_tier, admin_notes, created_at`,
    [
      agencyId,
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

  return res.status(201).json(result.rows[0]);
}));

// GET /api/v1/workspaces/:id - Get detailed status of a specific workspace
router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.params.id;
  const agencyId = req.agencyId!;

  // Tenant check gate
  await assertWorkspaceBelongsToAgency(workspaceId, agencyId);

  const result = await query(
    `SELECT cw.id, cw.client_name, cw.contact_name, cw.contact_email, cw.contact_phone,
            cw.website_url, cw.industry, cw.onboarding_status, cw.plan_tier, cw.admin_notes,
            COALESCE(cw.feature_flags, '{"forms": false, "mailbox": false, "tickets": false, "logs": false}'::jsonb) as feature_flags,
            cw.created_at,
            COALESCE(COUNT(a.id), 0)::int as agent_count
     FROM client_workspaces cw
     LEFT JOIN agents a ON cw.id = a.client_workspace_id
     WHERE cw.id = $1
     GROUP BY cw.id`,
    [workspaceId]
  );

  return res.json(result.rows[0]);
}));

// PATCH /api/v1/workspaces/:id - Update client workspace CRM details
router.patch('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.params.id;
  const agencyId = req.agencyId!;

  await assertWorkspaceBelongsToAgency(workspaceId, agencyId);

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
     RETURNING id, client_name, contact_name, contact_email, contact_phone, website_url, industry, onboarding_status, plan_tier, admin_notes, created_at`,
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
      workspaceId,
    ]
  );

  return res.json(result.rows[0]);
}));

// DELETE /api/v1/workspaces/:id - Delete a client workspace (cascades to agents/data sources)
router.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.params.id;
  const agencyId = req.agencyId!;

  // Tenant check gate
  await assertWorkspaceBelongsToAgency(workspaceId, agencyId);

  await query('DELETE FROM client_workspaces WHERE id = $1', [workspaceId]);
  return res.status(204).send();
}));

// GET /api/v1/workspaces/:workspaceId/logs - List all tool action logs for agents in the workspace
router.get('/:workspaceId/logs', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { workspaceId } = req.params;
  const agencyId = req.agencyId!;

  // Verify workspace ownership
  await assertWorkspaceBelongsToAgency(workspaceId, agencyId);

  const result = await query(
    `SELECT l.id, l.action_type, l.action_input, l.action_result, l.status, l.created_at, a.name as agent_name
     FROM action_logs l
     JOIN agents a ON l.agent_id = a.id
     WHERE a.client_workspace_id = $1
     ORDER BY l.created_at DESC`,
    [workspaceId]
  );

  return res.json(result.rows);
}));

// GET /api/v1/workspaces/:workspaceId/tickets - List all tickets with agent assignment & automated status
router.get('/:workspaceId/tickets', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { workspaceId } = req.params;
  const agencyId = req.agencyId!;

  // Verify workspace ownership
  await assertWorkspaceBelongsToAgency(workspaceId, agencyId);

  const result = await query(
    `SELECT 
       t.id, 
       t.agent_id, 
       t.assigned_agent_id, 
       t.subject, 
       t.description, 
       t.department, 
       t.priority, 
       t.status, 
       t.automated_status, 
       t.resolution_summary, 
       t.created_at, 
       a.name as agent_name,
       aa.name as assigned_agent_name,
       aa.template_type as assigned_agent_type,
       pr.github_pr_url,
       pr.branch_name,
       pr.patch_diff,
       pr.reproduction_test
     FROM tickets t
     JOIN agents a ON t.agent_id = a.id
     LEFT JOIN agents aa ON t.assigned_agent_id = aa.id
     LEFT JOIN autofix_prs pr ON t.id = pr.ticket_id
     WHERE a.client_workspace_id = $1
     ORDER BY t.created_at DESC`,
    [workspaceId]
  );

  return res.json(result.rows);
}));

// POST /api/v1/workspaces/:workspaceId/tickets - Manually submit a ticket/task for the agent workforce
router.post('/:workspaceId/tickets', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { workspaceId } = req.params;
  const agencyId = req.agencyId!;
  const { subject, description, department, priority, assigned_agent_id } = req.body;

  if (!subject || !description) {
    return res.status(400).json({ error: 'subject and description are required' });
  }

  await assertWorkspaceBelongsToAgency(workspaceId, agencyId);

  // Find default or creator agent in workspace
  let agentId = assigned_agent_id;
  if (!agentId) {
    const defaultAgentRes = await query(
      `SELECT id FROM agents WHERE client_workspace_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [workspaceId]
    );
    if (!defaultAgentRes.rowCount || defaultAgentRes.rowCount === 0) {
      return res.status(400).json({ error: 'Please create an AI agent in this workspace first' });
    }
    agentId = defaultAgentRes.rows[0].id;
  }

  const insertRes = await query(
    `INSERT INTO tickets (agent_id, assigned_agent_id, subject, description, department, priority, status, automated_status)
     VALUES ($1, $2, $3, $4, $5, $6, 'open', 'idle')
     RETURNING id, agent_id, assigned_agent_id, subject, description, department, priority, status, automated_status, created_at`,
    [agentId, assigned_agent_id || null, subject, description, department || 'support', priority || 'medium']
  );

  return res.status(201).json(insertRes.rows[0]);
}));

// PATCH /api/v1/workspaces/:workspaceId/tickets/:ticketId - Update assignment, status, or priority
router.patch('/:workspaceId/tickets/:ticketId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { workspaceId, ticketId } = req.params;
  const agencyId = req.agencyId!;
  const { assigned_agent_id, status, priority, department } = req.body;

  await assertWorkspaceBelongsToAgency(workspaceId, agencyId);

  const updates: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (assigned_agent_id !== undefined) {
    updates.push(`assigned_agent_id = $${idx++}`);
    values.push(assigned_agent_id || null);
  }
  if (status !== undefined) {
    updates.push(`status = $${idx++}`);
    values.push(status);
  }
  if (priority !== undefined) {
    updates.push(`priority = $${idx++}`);
    values.push(priority);
  }
  if (department !== undefined) {
    updates.push(`department = $${idx++}`);
    values.push(department);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  values.push(ticketId);
  const q = `
    UPDATE tickets 
    SET ${updates.join(', ')} 
    WHERE id = $${idx}
    RETURNING *
  `;
  const result = await query(q, values);
  if (!result.rowCount || result.rowCount === 0) {
    return res.status(404).json({ error: 'Ticket not found' });
  }

  return res.json(result.rows[0]);
}));

// POST /api/v1/workspaces/:workspaceId/tickets/:ticketId/resolve - Trigger autonomous AI resolution
router.post('/:workspaceId/tickets/:ticketId/resolve', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { workspaceId, ticketId } = req.params;
  const agencyId = req.agencyId!;
  const { agent_id } = req.body;

  await assertWorkspaceBelongsToAgency(workspaceId, agencyId);

  const resolutionResult = await resolveTicketWithAgent({
    ticketId,
    agentId: agent_id,
    agencyId
  });

  return res.json(resolutionResult);
}));

export default router;
