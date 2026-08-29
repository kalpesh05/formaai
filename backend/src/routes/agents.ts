import { Router, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AuthenticatedRequest, authenticateAgency, assertWorkspaceBelongsToAgency, assertAgentBelongsToAgency } from '../middleware/auth';
import pool, { query } from '../config/db';
import { TEMPLATES } from '../config/templates';

const router = Router();

const asyncHandler = (fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

// GET /api/v1/workspaces/:workspaceId/agents - List all agents inside a workspace
router.get('/workspaces/:workspaceId/agents', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { workspaceId } = req.params;
  const agencyId = req.agencyId!;

  // Verify workspace is owned by the authenticated agency
  await assertWorkspaceBelongsToAgency(workspaceId, agencyId);

  const result = await query(
    `SELECT id, template_type, name, llm_provider, llm_model, status, created_at
     FROM agents
     WHERE client_workspace_id = $1
     ORDER BY created_at DESC`,
    [workspaceId]
  );

  return res.json(result.rows);
}));

// POST /api/v1/workspaces/:workspaceId/agents - Create an agent in a workspace using a preset template
router.post('/workspaces/:workspaceId/agents', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { workspaceId } = req.params;
  const { template_type, name } = req.body;
  const agencyId = req.agencyId!;

  if (!template_type || !name) {
    return res.status(400).json({ error: 'template_type and name are required' });
  }

  if (template_type !== 'support' && template_type !== 'sales') {
    return res.status(400).json({ error: 'template_type must be support or sales' });
  }

  // Verify workspace ownership
  await assertWorkspaceBelongsToAgency(workspaceId, agencyId);

  const preset = TEMPLATES[template_type as 'support' | 'sales'];

  // Checkout a dedicated client connection from the pool for transactional queries
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // 1. Insert the agent
    const agentInsertResult = await client.query(
      `INSERT INTO agents (client_workspace_id, template_type, name, llm_provider, llm_model, config, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'draft')
       RETURNING id, client_workspace_id, template_type, name, llm_provider, llm_model, status, config, created_at`,
      [workspaceId, template_type, name, preset.llm_provider, preset.llm_model, JSON.stringify(preset.config)]
    );
    const agent = agentInsertResult.rows[0];

    // 2. Seed default tools
    const tools = [];
    for (const tool of preset.tools) {
      const toolInsertResult = await client.query(
        `INSERT INTO agent_tools (agent_id, tool_type, tool_config, enabled)
         VALUES ($1, $2, $3, true)
         RETURNING id, tool_type, tool_config, enabled`,
        [agent.id, tool.tool_type, JSON.stringify(tool.tool_config)]
      );
      tools.push(toolInsertResult.rows[0]);
    }

    await client.query('COMMIT');
    return res.status(201).json({ ...agent, tools });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

// GET /api/v1/agents/:id - Fetch detailed agent settings including tools and data sources
router.get('/agents/:id', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const agencyId = req.agencyId!;

  // Verify agent ownership
  await assertAgentBelongsToAgency(id, agencyId);

  // Get Agent details
  const agentResult = await query(
    `SELECT id, client_workspace_id, template_type, name, llm_provider, llm_model, status, config, api_key, created_at
     FROM agents
     WHERE id = $1`,
    [id]
  );
  
  if (!agentResult.rowCount || agentResult.rowCount === 0) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  const agent = agentResult.rows[0];

  // Get tools
  const toolsResult = await query(
    `SELECT id, tool_type, tool_config, enabled FROM agent_tools WHERE agent_id = $1`,
    [id]
  );

  // Get data sources
  const dataSourcesResult = await query(
    `SELECT id, source_type, source_ref, status, created_at FROM data_sources WHERE agent_id = $1`,
    [id]
  );

  return res.json({
    ...agent,
    tools: toolsResult.rows,
    data_sources: dataSourcesResult.rows
  });
}));

// PATCH /api/v1/agents/:id - Update agent configuration parameters
router.patch('/agents/:id', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { name, llm_provider, llm_model, config } = req.body;
  const agencyId = req.agencyId!;

  // Verify agent ownership
  await assertAgentBelongsToAgency(id, agencyId);

  const updates: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (name !== undefined) {
    updates.push(`name = $${idx++}`);
    values.push(name);
  }
  if (llm_provider !== undefined) {
    updates.push(`llm_provider = $${idx++}`);
    values.push(llm_provider);
  }
  if (llm_model !== undefined) {
    updates.push(`llm_model = $${idx++}`);
    values.push(llm_model);
  }
  if (config !== undefined) {
    updates.push(`config = $${idx++}`);
    values.push(JSON.stringify(config));
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'At least one field to update must be provided' });
  }

  values.push(id);
  const updateQuery = `
    UPDATE agents 
    SET ${updates.join(', ')} 
    WHERE id = $${idx} 
    RETURNING id, client_workspace_id, template_type, name, llm_provider, llm_model, status, config, api_key, created_at
  `;

  const result = await query(updateQuery, values);
  if (!result.rowCount || result.rowCount === 0) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  return res.json(result.rows[0]);
}));

// POST /api/v1/agents/:id/deploy - Deploy agent: generates a secure API key and sets status to live
router.post('/agents/:id/deploy', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const agencyId = req.agencyId!;

  // Verify agent ownership
  await assertAgentBelongsToAgency(id, agencyId);

  // Generate cryptographically secure client widget API token with fa_live_ prefix
  const rawKey = crypto.randomBytes(24).toString('hex');
  const apiKey = `fa_live_${rawKey}`;

  const result = await query(
    `UPDATE agents
     SET status = 'live', api_key = $1
     WHERE id = $2
     RETURNING api_key, status`,
    [apiKey, id]
  );

  if (!result.rowCount || result.rowCount === 0) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  return res.json(result.rows[0]);
}));

// PATCH /api/v1/agent-tools/:toolId - Enable/disable a specific tool
router.patch('/agent-tools/:toolId', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { toolId } = req.params;
  const { enabled } = req.body;
  const agencyId = req.agencyId!;

  // Verify the tool belongs to an agent owned by the agency
  const toolCheck = await query(
    `SELECT t.id, a.id as agent_id FROM agent_tools t
     JOIN agents a ON t.agent_id = a.id
     JOIN client_workspaces w ON a.client_workspace_id = w.id
     WHERE t.id = $1 AND w.agency_id = $2`,
    [toolId, agencyId]
  );
  if (!toolCheck.rowCount || toolCheck.rowCount === 0) {
    return res.status(403).json({ error: 'Access denied or tool not found' });
  }

  const updateResult = await query(
    `UPDATE agent_tools SET enabled = $1 WHERE id = $2 RETURNING id, tool_type, enabled`,
    [enabled, toolId]
  );
  return res.json(updateResult.rows[0]);
}));

export default router;
