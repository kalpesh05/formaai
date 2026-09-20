import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest, authenticateAgency, assertAgentBelongsToAgency } from '../middleware/auth';
import { query } from '../config/db';
import { generateAutoFix, AutoFixRequest } from '../services/autofix';

const router = Router();

const asyncHandler = (fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

/**
 * POST /api/v1/agents/:id/autofix/generate
 * Diagnoses an issue, generates reproduction tests, synthesizes patch, and creates GitHub PR
 */
router.post('/agents/:id/autofix/generate', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const agentId = req.params.id;
  const agencyId = req.agencyId!;
  await assertAgentBelongsToAgency(agentId, agencyId);

  const { bugDescription, errorTrace, targetFile, ticketId, title, repoConfig } = req.body;

  if (!bugDescription) {
    return res.status(400).json({ error: 'bugDescription is required' });
  }

  const fixRequest: AutoFixRequest = {
    agentId,
    bugDescription,
    errorTrace,
    targetFile,
    ticketId,
    title,
    repoConfig
  };

  const autoFixResult = await generateAutoFix(fixRequest);

  return res.status(201).json({
    success: true,
    pr: autoFixResult
  });
}));

/**
 * GET /api/v1/agents/:id/autofix/prs
 * Lists all generated Auto-Fix Pull Requests for this agent
 */
router.get('/agents/:id/autofix/prs', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const agentId = req.params.id;
  const agencyId = req.agencyId!;
  await assertAgentBelongsToAgency(agentId, agencyId);

  const prsRes = await query(
    `SELECT * FROM autofix_prs WHERE agent_id = $1 ORDER BY created_at DESC`,
    [agentId]
  );

  return res.status(200).json({
    success: true,
    prs: prsRes.rows
  });
}));

/**
 * GET /api/v1/agents/:id/autofix/prs/:prId
 * Gets detailed diagnostic record for a specific Auto-Fix PR
 */
router.get('/agents/:id/autofix/prs/:prId', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id: agentId, prId } = req.params;
  const agencyId = req.agencyId!;
  await assertAgentBelongsToAgency(agentId, agencyId);

  const prRes = await query(
    `SELECT * FROM autofix_prs WHERE id = $1 AND agent_id = $2`,
    [prId, agentId]
  );

  if (prRes.rowCount === 0) {
    return res.status(404).json({ error: 'Auto-Fix PR not found' });
  }

  return res.status(200).json({
    success: true,
    pr: prRes.rows[0]
  });
}));

/**
 * POST /api/v1/agents/:id/autofix/prs/:prId/approve
 * Approves an Auto-Fix PR for staging deployment pipeline
 */
router.post('/agents/:id/autofix/prs/:prId/approve', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id: agentId, prId } = req.params;
  const agencyId = req.agencyId!;
  await assertAgentBelongsToAgency(agentId, agencyId);

  const { environments = ['dev', 'stage'] } = req.body;

  const updateRes = await query(
    `UPDATE autofix_prs 
     SET status = 'approved', environments = $1, updated_at = now()
     WHERE id = $2 AND agent_id = $3
     RETURNING *`,
    [JSON.stringify(environments), prId, agentId]
  );

  if (updateRes.rowCount === 0) {
    return res.status(404).json({ error: 'Auto-Fix PR not found' });
  }

  return res.status(200).json({
    success: true,
    message: 'Auto-Fix PR approved for deployment',
    pr: updateRes.rows[0]
  });
}));

/**
 * POST /api/v1/agents/:id/autofix/prs/:prId/merge
 * Merges Auto-Fix PR and promotes to production with all tests verified
 */
router.post('/agents/:id/autofix/prs/:prId/merge', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id: agentId, prId } = req.params;
  const agencyId = req.agencyId!;
  await assertAgentBelongsToAgency(agentId, agencyId);

  const updateRes = await query(
    `UPDATE autofix_prs 
     SET status = 'merged', environments = '["dev", "stage", "prod"]', updated_at = now()
     WHERE id = $1 AND agent_id = $2
     RETURNING *`,
    [prId, agentId]
  );

  if (updateRes.rowCount === 0) {
    return res.status(404).json({ error: 'Auto-Fix PR not found' });
  }

  return res.status(200).json({
    success: true,
    message: 'Auto-Fix PR merged and deployed across Dev, Stage, and Prod environments',
    pr: updateRes.rows[0]
  });
}));

/**
 * POST /api/v1/agents/:id/autofix/prs/:prId/reject
 * Rejects an Auto-Fix PR
 */
router.post('/agents/:id/autofix/prs/:prId/reject', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id: agentId, prId } = req.params;
  const agencyId = req.agencyId!;
  await assertAgentBelongsToAgency(agentId, agencyId);

  const updateRes = await query(
    `UPDATE autofix_prs 
     SET status = 'rejected', updated_at = now()
     WHERE id = $1 AND agent_id = $2
     RETURNING *`,
    [prId, agentId]
  );

  if (updateRes.rowCount === 0) {
    return res.status(404).json({ error: 'Auto-Fix PR not found' });
  }

  return res.status(200).json({
    success: true,
    message: 'Auto-Fix PR rejected',
    pr: updateRes.rows[0]
  });
}));

export default router;
