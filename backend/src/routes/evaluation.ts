import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest, authenticateAgency, assertAgentBelongsToAgency } from '../middleware/auth';
import { query } from '../config/db';
import { runBatchEvaluation, generateSyntheticBenchmark, TestCaseInput } from '../services/evaluator';

const router = Router();

const asyncHandler = (fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

/**
 * POST /api/v1/agents/:id/evaluate
 * Runs offline benchmark verification battery against the agent's ingested knowledge base
 */
router.post('/agents/:id/evaluate', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const agentId = req.params.id;
  const agencyId = req.agencyId!;
  await assertAgentBelongsToAgency(agentId, agencyId);

  const { dataset_name = 'Custom Verification Suite', test_cases, auto_generate = false, count = 10, confidence_threshold } = req.body;

  // Retrieve agent config for confidence threshold if not explicitly passed
  let threshold = confidence_threshold;
  if (threshold === undefined) {
    const agentRes = await query(`SELECT config FROM agents WHERE id = $1`, [agentId]);
    threshold = agentRes.rows[0]?.config?.confidenceThreshold ?? 0.70;
  }

  let finalTestCases: TestCaseInput[] = [];

  if (auto_generate || (!test_cases || !Array.isArray(test_cases) || test_cases.length === 0)) {
    finalTestCases = await generateSyntheticBenchmark(agentId, count);
  } else {
    finalTestCases = test_cases;
  }

  const summary = await runBatchEvaluation(
    agentId,
    dataset_name,
    finalTestCases,
    threshold
  );

  return res.status(200).json(summary);
}));

/**
 * GET /api/v1/agents/:id/evaluations
 * Retrieves past benchmark run history for an agent
 */
router.get('/agents/:id/evaluations', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const agentId = req.params.id;
  const agencyId = req.agencyId!;
  await assertAgentBelongsToAgency(agentId, agencyId);

  const runsResult = await query(
    `SELECT id, dataset_name, total_tests, passed_tests, accuracy_rate, avg_similarity, 
            hallucination_count, low_confidence_count, created_at 
     FROM evaluation_runs 
     WHERE agent_id = $1 
     ORDER BY created_at DESC 
     LIMIT 20`,
    [agentId]
  );

  return res.status(200).json(runsResult.rows || []);
}));

/**
 * GET /api/v1/agents/:id/evaluations/:runId
 * Retrieves full itemized test results for a specific evaluation run
 */
router.get('/agents/:id/evaluations/:runId', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id: agentId, runId } = req.params;
  const agencyId = req.agencyId!;
  await assertAgentBelongsToAgency(agentId, agencyId);

  const runResult = await query(
    `SELECT * FROM evaluation_runs WHERE id = $1 AND agent_id = $2`,
    [runId, agentId]
  );

  if (!runResult.rowCount || runResult.rowCount === 0) {
    return res.status(404).json({ error: 'Evaluation run not found' });
  }

  return res.status(200).json(runResult.rows[0]);
}));

/**
 * GET /api/v1/agents/:id/copilot/drafts
 * Retrieves pending Copilot/Shadow Mode draft responses for human agent review
 */
router.get('/agents/:id/copilot/drafts', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const agentId = req.params.id;
  const agencyId = req.agencyId!;
  await assertAgentBelongsToAgency(agentId, agencyId);

  const draftsResult = await query(
    `SELECT * FROM copilot_drafts 
     WHERE agent_id = $1 
     ORDER BY created_at DESC 
     LIMIT 50`,
    [agentId]
  );

  return res.status(200).json(draftsResult.rows || []);
}));

/**
 * POST /api/v1/agents/:id/copilot/drafts/:draftId/approve
 * Approves a shadow mode draft response and delivers it to the conversation
 */
router.post('/agents/:id/copilot/drafts/:draftId/approve', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id: agentId, draftId } = req.params;
  const agencyId = req.agencyId!;
  await assertAgentBelongsToAgency(agentId, agencyId);

  const { edited_reply } = req.body;

  const draftRes = await query(
    `SELECT * FROM copilot_drafts WHERE id = $1 AND agent_id = $2`,
    [draftId, agentId]
  );

  if (!draftRes.rowCount || draftRes.rowCount === 0) {
    return res.status(404).json({ error: 'Draft not found' });
  }

  const draft = draftRes.rows[0];
  const finalReply = edited_reply !== undefined ? edited_reply : draft.draft_reply;

  // Update draft status
  await query(
    `UPDATE copilot_drafts 
     SET status = 'approved', edited_reply = $1, updated_at = now() 
     WHERE id = $2`,
    [edited_reply !== undefined ? edited_reply : null, draftId]
  );

  // If connected to a conversation session, deliver to messages table
  if (draft.conversation_id) {
    await query(
      `INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'assistant', $2)`,
      [draft.conversation_id, finalReply]
    );
  }

  return res.status(200).json({ success: true, message: 'Draft approved and dispatched', final_reply: finalReply });
}));

/**
 * POST /api/v1/agents/:id/copilot/drafts/:draftId/reject
 * Rejects a shadow mode draft response
 */
router.post('/agents/:id/copilot/drafts/:draftId/reject', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id: agentId, draftId } = req.params;
  const agencyId = req.agencyId!;
  await assertAgentBelongsToAgency(agentId, agencyId);

  const { reason } = req.body;

  const draftRes = await query(
    `SELECT * FROM copilot_drafts WHERE id = $1 AND agent_id = $2`,
    [draftId, agentId]
  );

  if (!draftRes.rowCount || draftRes.rowCount === 0) {
    return res.status(404).json({ error: 'Draft not found' });
  }

  await query(
    `UPDATE copilot_drafts 
     SET status = 'rejected', updated_at = now() 
     WHERE id = $1`,
    [draftId]
  );

  return res.status(200).json({ success: true, message: 'Draft rejected', reason });
}));

export default router;
