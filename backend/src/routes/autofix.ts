import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest, authenticateAgency, authenticateWidgetOrAgency, assertAgentBelongsToAgency } from '../middleware/auth';
import { query } from '../config/db';
import { generateAutoFix, AutoFixRequest } from '../services/autofix';

const router = Router();

const asyncHandler = (fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

/**
 * POST /api/v1/agents/:id/telemetry/crash
 * Autonomous Crash Receiver: Called automatically by widget.js on unhandled exceptions & promise rejections.
 * Diagnoses the root cause, writes reproduction test, generates patch, and opens a ready-to-merge PR.
 */
router.post('/agents/:id/telemetry/crash', authenticateWidgetOrAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const agentId = req.params.id;

  // Tenant security verification
  if (req.isWidget && req.agentId !== agentId) {
    return res.status(403).json({ error: 'Access denied: Widget key mismatch' });
  }

  const { message, source_file, line_number, column_number, error_trace, user_context } = req.body;

  if (!message && !error_trace) {
    return res.status(400).json({ error: 'message or error_trace is required' });
  }

  // 1. Debounce duplicate errors within last 15 minutes to prevent PR flooding
  const recentDuplicate = await query(
    `SELECT id, github_pr_url, status FROM autofix_prs
     WHERE agent_id = $1 
       AND (bug_description ILIKE $2 OR target_file = $3)
       AND created_at > now() - interval '15 minutes'
     LIMIT 1`,
    [agentId, `%${(message || '').slice(0, 50)}%`, source_file || '']
  );

  if (recentDuplicate.rowCount && recentDuplicate.rowCount > 0) {
    const existing = recentDuplicate.rows[0];
    return res.status(200).json({
      success: true,
      deduplicated: true,
      message: 'Similar error already diagnosed recently',
      autofix_pr_id: existing.id,
      autofix_pr_url: existing.github_pr_url
    });
  }

  // 2. Format title and error description
  const cleanSourceFile = source_file ? source_file.replace(/^[a-z]+:\/\/[^/]+/i, '') : 'src/app.js';
  const cleanTitle = `Autonomous Fix: ${message ? message.slice(0, 70) : 'Unhandled exception'}`;
  const fullDescription = `Autonomous Error Telemetry Catch:
Error: ${message}
Location: ${source_file || 'unknown'}:${line_number || 0}:${column_number || 0}
URL: ${user_context?.url || 'unknown'}
User Agent: ${user_context?.userAgent || 'unknown'}

Full Stack Trace:
${error_trace || 'No trace provided'}`;

  // 3. Create a linked support ticket for agency audit trail
  let ticketId: string | undefined = undefined;
  try {
    const ticketRes = await query(
      `INSERT INTO tickets (agent_id, subject, description, status) 
       VALUES ($1, $2, $3, 'open') 
       RETURNING id`,
      [agentId, `[Auto-Fix] ${message ? message.slice(0, 60) : 'Unhandled Runtime Exception'}`, fullDescription]
    );
    if (ticketRes.rowCount && ticketRes.rowCount > 0) {
      ticketId = ticketRes.rows[0].id;
    }
  } catch (err: any) {
    console.warn('[Telemetry Crash] Could not create ticket:', err.message);
  }

  // 4. Generate Auto-Fix PR using Gemini 3.1 Pro
  const autoFixResult = await generateAutoFix({
    agentId,
    ticketId,
    title: cleanTitle,
    bugDescription: message || 'Unhandled browser runtime crash',
    errorTrace: error_trace || `${message} at ${source_file}:${line_number}`,
    targetFile: cleanSourceFile
  });

  return res.status(201).json({
    success: true,
    deduplicated: false,
    autofix_pr_id: autoFixResult.id,
    autofix_pr_url: autoFixResult.github_pr_url,
    ticket_id: ticketId,
    patch_diff: autoFixResult.patch_diff,
    reproduction_test: autoFixResult.reproduction_test
  });
}));

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
