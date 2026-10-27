import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest, authenticateAgency, assertAgentBelongsToAgency } from '../middleware/auth';
import { query } from '../config/db';
import { DEFAULT_AOPS } from '../services/aopEngine';

const router = Router();

const asyncHandler = (fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

/**
 * Ensure table exists on first query (graceful self-migration)
 */
async function ensureAOPTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS agent_aops (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      trigger_keywords TEXT[] NOT NULL DEFAULT '{}',
      mandatory_variables TEXT[] NOT NULL DEFAULT '{}',
      steps TEXT[] NOT NULL DEFAULT '{}',
      guardrails TEXT[] NOT NULL DEFAULT '{}',
      escalation_criteria TEXT[] NOT NULL DEFAULT '{}',
      enabled BOOLEAN NOT NULL DEFAULT true,
      version INT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_agent_aops_agent ON agent_aops(agent_id);
  `);
}

// GET /api/v1/agents/:id/aops - List all AOPs for an agent
router.get('/agents/:id/aops', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const agentId = req.params.id;
  await assertAgentBelongsToAgency(agentId, req.agencyId!);
  await ensureAOPTable();

  const result = await query(
    `SELECT * FROM agent_aops WHERE agent_id = $1 ORDER BY created_at ASC`,
    [agentId]
  );

  return res.json({ aops: result.rows });
}));

// POST /api/v1/agents/:id/aops - Create a new AOP
router.post('/agents/:id/aops', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const agentId = req.params.id;
  await assertAgentBelongsToAgency(agentId, req.agencyId!);
  await ensureAOPTable();

  const {
    name,
    description,
    trigger_keywords = [],
    mandatory_variables = [],
    steps = [],
    guardrails = [],
    escalation_criteria = [],
    enabled = true
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Procedure name is required' });
  }

  const result = await query(
    `INSERT INTO agent_aops 
     (agent_id, name, description, trigger_keywords, mandatory_variables, steps, guardrails, escalation_criteria, enabled)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      agentId,
      name.trim(),
      description || '',
      Array.isArray(trigger_keywords) ? trigger_keywords : [],
      Array.isArray(mandatory_variables) ? mandatory_variables : [],
      Array.isArray(steps) ? steps : [],
      Array.isArray(guardrails) ? guardrails : [],
      Array.isArray(escalation_criteria) ? escalation_criteria : [],
      Boolean(enabled)
    ]
  );

  return res.status(201).json(result.rows[0]);
}));

// PUT /api/v1/agents/:id/aops/:aopId - Update an existing AOP
router.put('/agents/:id/aops/:aopId', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id: agentId, aopId } = req.params;
  await assertAgentBelongsToAgency(agentId, req.agencyId!);
  await ensureAOPTable();

  const {
    name,
    description,
    trigger_keywords,
    mandatory_variables,
    steps,
    guardrails,
    escalation_criteria,
    enabled
  } = req.body;

  const existingRes = await query(`SELECT * FROM agent_aops WHERE id = $1 AND agent_id = $2`, [aopId, agentId]);
  if (!existingRes.rowCount || existingRes.rowCount === 0) {
    return res.status(404).json({ error: 'Procedure not found' });
  }

  const current = existingRes.rows[0];

  const updatedName = name !== undefined ? name.trim() : current.name;
  const updatedDesc = description !== undefined ? description : current.description;
  const updatedKeywords = Array.isArray(trigger_keywords) ? trigger_keywords : current.trigger_keywords;
  const updatedVars = Array.isArray(mandatory_variables) ? mandatory_variables : current.mandatory_variables;
  const updatedSteps = Array.isArray(steps) ? steps : current.steps;
  const updatedGuardrails = Array.isArray(guardrails) ? guardrails : current.guardrails;
  const updatedEscalation = Array.isArray(escalation_criteria) ? escalation_criteria : current.escalation_criteria;
  const updatedEnabled = enabled !== undefined ? Boolean(enabled) : current.enabled;
  const newVersion = (current.version || 1) + 1;

  const result = await query(
    `UPDATE agent_aops 
     SET name = $1, description = $2, trigger_keywords = $3, mandatory_variables = $4,
         steps = $5, guardrails = $6, escalation_criteria = $7, enabled = $8,
         version = $9, updated_at = now()
     WHERE id = $10 AND agent_id = $11
     RETURNING *`,
    [
      updatedName,
      updatedDesc,
      updatedKeywords,
      updatedVars,
      updatedSteps,
      updatedGuardrails,
      updatedEscalation,
      updatedEnabled,
      newVersion,
      aopId,
      agentId
    ]
  );

  return res.json(result.rows[0]);
}));

// DELETE /api/v1/agents/:id/aops/:aopId - Delete an AOP
router.delete('/agents/:id/aops/:aopId', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id: agentId, aopId } = req.params;
  await assertAgentBelongsToAgency(agentId, req.agencyId!);
  await ensureAOPTable();

  await query(`DELETE FROM agent_aops WHERE id = $1 AND agent_id = $2`, [aopId, agentId]);
  return res.json({ success: true, message: 'Procedure deleted' });
}));

// POST /api/v1/agents/:id/aops/seed-defaults - Clone default enterprise AOPs
router.post('/agents/:id/aops/seed-defaults', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const agentId = req.params.id;
  await assertAgentBelongsToAgency(agentId, req.agencyId!);
  await ensureAOPTable();

  for (const def of DEFAULT_AOPS) {
    await query(
      `INSERT INTO agent_aops 
       (agent_id, name, description, trigger_keywords, mandatory_variables, steps, guardrails, escalation_criteria, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
       ON CONFLICT DO NOTHING`,
      [
        agentId,
        def.name,
        def.description,
        def.keywords,
        def.mandatoryVariables || [],
        def.steps,
        def.guardrails,
        def.escalationConditions
      ]
    );
  }

  const result = await query(
    `SELECT * FROM agent_aops WHERE agent_id = $1 ORDER BY created_at ASC`,
    [agentId]
  );

  return res.json({ aops: result.rows, message: 'Default enterprise procedures seeded successfully' });
}));

export default router;
