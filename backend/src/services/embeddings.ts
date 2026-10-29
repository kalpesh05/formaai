import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let genAI: GoogleGenerativeAI | null = null;
if (GEMINI_API_KEY && GEMINI_API_KEY.trim() !== '' && !GEMINI_API_KEY.startsWith('replace_this')) {
  genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
}

/**
 * Generates a deterministic mock embedding of 768 float dimensions for testing/local dev.
 * Identical inputs will yield identical mock vectors, making semantic lookup tests work.
 */
export function generateMockEmbedding(text: string): number[] {
  const embedding: number[] = new Array(768).fill(0);
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  for (let i = 0; i < 768; i++) {
    const seed = Math.sin(hash + i) * 10000;
    embedding[i] = seed - Math.floor(seed);
  }
  return embedding;
}

/**
 * Request a 768-dimension vector embedding using Gemini embedding models.
 * Uses text-embedding-004 (or embedding-001), normalized to 768 dimensions for pgvector.
 * Falls back to generateMockEmbedding if no valid API key is present, API calls fail, or times out.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text) {
    throw new Error('Text is required to generate embedding');
  }

  if (!genAI) {
    return generateMockEmbedding(text);
  }

  const candidateModels = ['text-embedding-005', 'text-embedding-004', 'gemini-embedding-001', 'embedding-001'];
  let lastError: any = null;
  const EMBED_TIMEOUT_MS = 4000;

  for (const modelName of candidateModels) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Embedding call to ${modelName} timed out after ${EMBED_TIMEOUT_MS}ms`)), EMBED_TIMEOUT_MS)
      );

      const result = await Promise.race([
        model.embedContent({
          content: { role: 'user', parts: [{ text }] },
          // @ts-ignore
          outputDimensionality: 768
        }),
        timeoutPromise
      ]);

      if (result.embedding && result.embedding.values && result.embedding.values.length > 0) {
        let values = result.embedding.values;
        if (values.length > 768) {
          values = values.slice(0, 768);
        } else if (values.length < 768) {
          values = values.concat(new Array(768 - values.length).fill(0));
        }
        return values;
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`[Embeddings] Candidate '${modelName}' failed: ${err.message}`);
    }
  }

  console.warn('Gemini Embedding API call failed or timed out. Falling back to mock. Error:', lastError?.message);
  return generateMockEmbedding(text);
}
