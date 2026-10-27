import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest, authenticateAgency, assertAgentBelongsToAgency } from '../middleware/auth';
import { query } from '../config/db';
import { runDuetAnalysis, approveKnowledgeGap, dismissKnowledgeGap, ensureDuetTable } from '../services/duetWorker';

const router = Router();

const asyncHandler = (fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

// GET /api/v1/agents/:id/duet/gaps - List all gaps
router.get('/agents/:id/duet/gaps', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const agentId = req.params.id;
  await assertAgentBelongsToAgency(agentId, req.agencyId!);
  await ensureDuetTable();

  const result = await query(
    `SELECT * FROM duet_knowledge_gaps WHERE agent_id = $1 ORDER BY created_at DESC`,
    [agentId]
  );

  return res.json({ gaps: result.rows });
}));

// POST /api/v1/agents/:id/duet/run-analysis - Trigger Duet scan
router.post('/agents/:id/duet/run-analysis', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const agentId = req.params.id;
  await assertAgentBelongsToAgency(agentId, req.agencyId!);

  const gaps = await runDuetAnalysis(agentId);
  return res.json({ gaps, message: 'Duet active learning analysis completed.' });
}));

// POST /api/v1/agents/:id/duet/gaps/:gapId/approve - 1-Click Approve & Ingest into Vector DB
router.post('/agents/:id/duet/gaps/:gapId/approve', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id: agentId, gapId } = req.params;
  await assertAgentBelongsToAgency(agentId, req.agencyId!);

  const result = await approveKnowledgeGap(agentId, gapId);
  return res.json(result);
}));

// POST /api/v1/agents/:id/duet/gaps/:gapId/dismiss - Dismiss gap recommendation
router.post('/agents/:id/duet/gaps/:gapId/dismiss', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id: agentId, gapId } = req.params;
  await assertAgentBelongsToAgency(agentId, req.agencyId!);

  await dismissKnowledgeGap(agentId, gapId);
  return res.json({ success: true, message: 'Knowledge gap dismissed' });
}));

export default router;
