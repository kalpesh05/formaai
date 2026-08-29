import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../config/db';

const JWT_SECRET = process.env.JWT_SECRET || 'local_dev_forma_ai_jwt_secret_998877665544332211';

export interface AuthenticatedRequest extends Request {
  agencyId?: string;
  agentId?: string;
  isWidget?: boolean;
}

export const authenticateAgency = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  console.log(`[AUTH DEBUG] Path: ${req.path}, AuthHeader: ${authHeader ? 'present' : 'missing'}`);
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization token required' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { agencyId: string };
    req.agencyId = decoded.agencyId;
    next();
  } catch (err: any) {
    console.error(`[AUTH DEBUG] JWT Verification failed for path ${req.path}:`, err.message);
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
};

/**
 * Asserts that the client workspace belongs to the authenticated agency.
 * Throws an error with a 403 status code if access is denied or not found.
 */
export const assertWorkspaceBelongsToAgency = async (workspaceId: string, agencyId: string): Promise<void> => {
  if (!workspaceId || !agencyId) {
    const err = new Error('Workspace ID and Agency ID are required');
    (err as any).statusCode = 400;
    throw err;
  }
  const result = await query(
    'SELECT 1 FROM client_workspaces WHERE id = $1 AND agency_id = $2',
    [workspaceId, agencyId]
  );
  if (result.rowCount === 0) {
    const err = new Error('Workspace not found or access denied');
    (err as any).statusCode = 403;
    throw err;
  }
};

/**
 * Asserts that the agent belongs to a client workspace owned by the authenticated agency.
 * Throws an error with a 403 status code if access is denied or not found.
 */
export const assertAgentBelongsToAgency = async (agentId: string, agencyId: string): Promise<void> => {
  if (!agentId || !agencyId) {
    const err = new Error('Agent ID and Agency ID are required');
    (err as any).statusCode = 400;
    throw err;
  }
  const result = await query(
    `SELECT 1 FROM agents a
     JOIN client_workspaces w ON a.client_workspace_id = w.id
     WHERE a.id = $1 AND w.agency_id = $2`,
    [agentId, agencyId]
  );
  if (result.rowCount === 0) {
    const err = new Error('Agent not found or access denied');
    (err as any).statusCode = 403;
    throw err;
  }
};

/**
 * Middleware supporting dual authentication methods:
 * 1. Bearer JWT (Agency owner dashboard testing)
 * 2. X-Agent-Key header (Lightweight embeddable web widget)
 */
export const authenticateWidgetOrAgency = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const agentKey = req.headers['x-agent-key'];

  // 1. If it's a client widget request (authenticated by API key)
  if (agentKey) {
    const keyStr = Array.isArray(agentKey) ? agentKey[0] : agentKey;
    try {
      const result = await query(
        `SELECT id, client_workspace_id FROM agents WHERE api_key = $1 AND status = 'live'`,
        [keyStr]
      );
      if (result.rowCount === 0) {
        res.status(401).json({ error: 'Invalid or inactive agent widget key' });
        return;
      }
      req.agentId = result.rows[0].id;
      req.isWidget = true;
      next();
      return;
    } catch (err: any) {
      res.status(500).json({ error: err.message });
      return;
    }
  }

  // 2. If it's an agency dashboard session (authenticated by JWT Bearer token)
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { agencyId: string };
      req.agencyId = decoded.agencyId;
      req.isWidget = false;
      next();
      return;
    } catch (err: any) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
  }

  res.status(401).json({ error: 'Authentication required: Provide Bearer Token or X-Agent-Key' });
};
