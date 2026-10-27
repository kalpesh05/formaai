import { query } from '../config/db';
import { generateEmbedding } from './embeddings';

export interface RetrievedChunk {
  id?: string;
  content: string;
  similarity: number;
  keywordScore?: number;
  rrfScore?: number;
}

export interface HybridSearchResult {
  chunks: RetrievedChunk[];
  topSimilarity: number;
  hasKeywordMatch: boolean;
  chunksText: string;
}

/**
 * Executes Hybrid Retrieval: Dense Semantic Vector Search + Sparse BM25 Full-Text Search.
 * 
 * Fuses results using Reciprocal Rank Fusion (RRF):
 * RRF_score(d) = sum(1 / (k + rank_i(d))) with constant k = 60
 * 
 * This prevents the classic RAG flaw where semantic search misses exact error codes,
 * specific pricing numbers, or proper names that BM25 catches immediately.
 */
export async function performHybridSearch(
  agentId: string,
  searchQuery: string,
  limit: number = 5
): Promise<HybridSearchResult> {
  if (!searchQuery || !searchQuery.trim()) {
    return { chunks: [], topSimilarity: 0, hasKeywordMatch: false, chunksText: '' };
  }

  const cleanText = searchQuery.trim();
  let vectorChunks: Array<{ id: string; content: string; similarity: number }> = [];
  let keywordChunks: Array<{ id: string; content: string; rank: number }> = [];

  // 1. Semantic Vector Search
  try {
    const userEmbedding = await generateEmbedding(cleanText);
    const vectorStr = `[${userEmbedding.join(',')}]`;

    const res = await query(
      `SELECT id, content, 1 - (embedding <=> $2::vector) AS similarity
       FROM chunks
       WHERE agent_id = $1
       ORDER BY embedding <=> $2::vector
       LIMIT $3`,
      [agentId, vectorStr, Math.max(limit * 2, 10)]
    );
    if (res.rows) {
      vectorChunks = res.rows.map(r => ({
        id: r.id,
        content: r.content,
        similarity: Math.max(0, parseFloat(r.similarity) || 0)
      }));
    }
  } catch (err: any) {
    console.warn('[HybridSearch] Vector retrieval failed:', err.message);
  }

  // 2. Keyword Full-Text Search (BM25-style using Postgres tsvector)
  try {
    const res = await query(
      `SELECT id, content, ts_rank_cd(to_tsvector('english', content), plainto_tsquery('english', $2)) AS rank
       FROM chunks
       WHERE agent_id = $1 AND to_tsvector('english', content) @@ plainto_tsquery('english', $2)
       ORDER BY rank DESC
       LIMIT $3`,
      [agentId, cleanText, Math.max(limit * 2, 10)]
    );
    if (res.rows) {
      keywordChunks = res.rows.map(r => ({
        id: r.id,
        content: r.content,
        rank: parseFloat(r.rank) || 0
      }));
    }
  } catch (err: any) {
    // If full-text query has syntax edge cases, log warning and rely on vector
    console.warn('[HybridSearch] Keyword full-text retrieval failed:', err.message);
  }

  // 3. Reciprocal Rank Fusion (RRF)
  const k = 60; // Standard RRF smoothing constant
  const scoreMap = new Map<string, { content: string; similarity: number; keywordScore: number; rrf: number }>();

  // Add vector ranks
  vectorChunks.forEach((chunk, index) => {
    const rank = index + 1;
    const rrfContrib = 1 / (k + rank);
    scoreMap.set(chunk.id, {
      content: chunk.content,
      similarity: chunk.similarity,
      keywordScore: 0,
      rrf: rrfContrib
    });
  });

  // Add keyword ranks
  keywordChunks.forEach((chunk, index) => {
    const rank = index + 1;
    const rrfContrib = 1 / (k + rank);
    const existing = scoreMap.get(chunk.id);
    if (existing) {
      existing.rrf += rrfContrib;
      existing.keywordScore = chunk.rank;
    } else {
      scoreMap.set(chunk.id, {
        content: chunk.content,
        similarity: 0,
        keywordScore: chunk.rank,
        rrf: rrfContrib
      });
    }
  });

  // Sort by combined RRF score
  const combined = Array.from(scoreMap.entries())
    .map(([id, data]) => ({
      id,
      content: data.content,
      similarity: data.similarity,
      keywordScore: data.keywordScore,
      rrfScore: data.rrf
    }))
    .sort((a, b) => (b.rrfScore || 0) - (a.rrfScore || 0))
    .slice(0, limit);

  const topSimilarity = vectorChunks.length > 0 ? vectorChunks[0].similarity : 0;
  const hasKeywordMatch = keywordChunks.length > 0;
  const chunksText = combined.map(c => c.content).join('\n---\n');

  return {
    chunks: combined,
    topSimilarity,
    hasKeywordMatch,
    chunksText
  };
}
