import pool, { query } from '../config/db';
import { generateEmbedding } from './embeddings';
import { chunkDocumentSemantic } from './chunker';

/**
 * Splits document text into chunks preserving code blocks, tables, and formulas.
 */
export function chunkText(text: string, chunkSizeWords = 400, overlapWords = 40, documentTitle?: string): string[] {
  return chunkDocumentSemantic(text, {
    maxChunkWords: chunkSizeWords,
    overlapWords: overlapWords,
    documentTitle: documentTitle,
  });
}

/**
 * Background orchestrator for processing data source text:
 * Chunks text, generates embeddings (using Gemini), stores vectors, and updates ingestion status.
 */
export async function processIngestion(
  agentId: string, 
  dataSourceId: string, 
  text: string, 
  documentTitle?: string
): Promise<void> {
  try {
    // 1. Chunk content semantically preserving syntax and formulas
    const chunks = chunkText(text, 400, 40, documentTitle);

    // 2. Open transaction to write chunks and update source state
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      for (const chunk of chunks) {
        if (!chunk.trim()) continue;
        
        // Generate embedding vector
        const embedding = await generateEmbedding(chunk);
        
        // Convert number array to pgvector text representation '[0.12, -0.45, ...]'
        const vectorStr = `[${embedding.join(',')}]`;
        
        await client.query(
          `INSERT INTO chunks (agent_id, data_source_id, content, embedding)
           VALUES ($1, $2, $3, $4::vector)`,
          [agentId, dataSourceId, chunk, vectorStr]
        );
      }
      
      // Mark as processed successfully
      await client.query(
        `UPDATE data_sources SET status = 'processed' WHERE id = $1`,
        [dataSourceId]
      );
      
      await client.query('COMMIT');
      console.log(`Ingestion succeeded for data source: ${dataSourceId}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error(`Ingestion pipeline failed for source ${dataSourceId}. Error:`, err.message);
    
    // Set status to failed
    await query(
      `UPDATE data_sources SET status = 'failed' WHERE id = $1`,
      [dataSourceId]
    );
  }
}
