import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest, authenticateAgency, assertWorkspaceBelongsToAgency } from '../middleware/auth';
import { query } from '../config/db';

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

// GET /api/v1/workspaces/:workspaceId/tickets - List all support tickets created by agents in the workspace
router.get('/:workspaceId/tickets', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { workspaceId } = req.params;
  const agencyId = req.agencyId!;

  // Verify workspace ownership
  await assertWorkspaceBelongsToAgency(workspaceId, agencyId);

  const result = await query(
    `SELECT t.id, t.subject, t.description, t.status, t.created_at, a.name as agent_name
     FROM tickets t
     JOIN agents a ON t.agent_id = a.id
     WHERE a.client_workspace_id = $1
     ORDER BY t.created_at DESC`,
    [workspaceId]
  );

  return res.json(result.rows);
}));

export default router;
