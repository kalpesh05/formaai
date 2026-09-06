import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { AuthenticatedRequest, authenticateAgency, assertAgentBelongsToAgency } from '../middleware/auth';
import { query } from '../config/db';
import { storage } from '../services/storage';
import { extractTextFromFile, extractTextFromUrl } from '../services/extractor';
import { processIngestion } from '../services/ingestion';

const router = Router();
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // Limit uploads to 10MB

const asyncHandler = (fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

// POST /api/v1/agents/:id/data-sources/file - Upload a text, PDF, DOCX, or CSV document
router.post('/agents/:id/data-sources/file', authenticateAgency, upload.single('file'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const agentId = req.params.id;
  const agencyId = req.agencyId!;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: 'File upload is required' });
  }

  // Enforce tenant boundary
  await assertAgentBelongsToAgency(agentId, agencyId);

  // 1. Create data source row in 'pending' status
  const insertResult = await query(
    `INSERT INTO data_sources (agent_id, source_type, source_ref, status)
     VALUES ($1, 'file', $2, 'pending')
     RETURNING id, source_type, source_ref, status, created_at`,
    [agentId, file.originalname]
  );
  
  const dataSource = insertResult.rows[0];

  // 2. Run file saving and ingestion asynchronously in the background
  (async () => {
    try {
      // Store raw document
      const savedPath = await storage.saveFile(agentId, dataSource.id, file.originalname, file.buffer);
      
      // Update database reference to local file path
      await query(`UPDATE data_sources SET source_ref = $1 WHERE id = $2`, [savedPath, dataSource.id]);

      // Extract text content
      const text = await extractTextFromFile(savedPath, file.originalname);

      // Perform chunking, vector generation, and insertion
      await processIngestion(agentId, dataSource.id, text);
    } catch (err: any) {
      console.error(`Background file ingestion failed for agent ${agentId}, source ${dataSource.id}:`, err.message);
      await query(`UPDATE data_sources SET status = 'failed' WHERE id = $1`, [dataSource.id]);
    }
  })();

  // Return immediately while processing runs in background
  return res.status(201).json(dataSource);
}));

// POST /api/v1/agents/:id/data-sources/url - Ingest a web page URL
router.post('/agents/:id/data-sources/url', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const agentId = req.params.id;
  const { url } = req.body;
  const agencyId = req.agencyId!;

  if (!url) {
    return res.status(400).json({ error: 'url is required' });
  }

  // Enforce tenant boundary
  await assertAgentBelongsToAgency(agentId, agencyId);

  // 1. Create data source row in 'pending' status
  const insertResult = await query(
    `INSERT INTO data_sources (agent_id, source_type, source_ref, status)
     VALUES ($1, 'url', $2, 'pending')
     RETURNING id, source_type, source_ref, status, created_at`,
    [agentId, url]
  );
  
  const dataSource = insertResult.rows[0];

  // 2. Perform URL content extraction and embedding in the background
  (async () => {
    try {
      const text = await extractTextFromUrl(url);
      await processIngestion(agentId, dataSource.id, text);
    } catch (err: any) {
      console.error(`Background URL ingestion failed for agent ${agentId}, source ${dataSource.id}:`, err.message);
      await query(`UPDATE data_sources SET status = 'failed' WHERE id = $1`, [dataSource.id]);
    }
  })();

  // Return immediately while processing runs in background
  return res.status(201).json(dataSource);
}));

// GET /api/v1/agents/:id/data-sources - List all data sources configured for an agent
router.get('/agents/:id/data-sources', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const agentId = req.params.id;
  const agencyId = req.agencyId!;

  // Enforce tenant boundary
  await assertAgentBelongsToAgency(agentId, agencyId);

  const result = await query(
    `SELECT id, source_type, source_ref, status, created_at
     FROM data_sources
     WHERE agent_id = $1
     ORDER BY created_at DESC`,
    [agentId]
  );

  return res.json(result.rows);
}));

// DELETE /api/v1/agents/:id/data-sources/:sourceId - Delete a data source and cascade chunks
router.delete('/agents/:id/data-sources/:sourceId', authenticateAgency, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id: agentId, sourceId } = req.params;
  const agencyId = req.agencyId!;

  // Enforce tenant boundary
  await assertAgentBelongsToAgency(agentId, agencyId);

  const deleteResult = await query(
    `DELETE FROM data_sources
     WHERE id = $1 AND agent_id = $2
     RETURNING id`,
    [sourceId, agentId]
  );

  if (deleteResult.rowCount === 0) {
    return res.status(404).json({ error: 'Data source not found.' });
  }

  return res.json({ success: true, message: 'Data source and associated embeddings deleted.' });
}));

export default router;
