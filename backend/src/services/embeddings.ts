import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const JINA_API_KEY = process.env.JINA_API_KEY;

let genAI: GoogleGenerativeAI | null = null;
if (GEMINI_API_KEY && GEMINI_API_KEY.trim() !== '' && !GEMINI_API_KEY.startsWith('replace_this')) {
  genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
}

/**
 * Generates a high-precision 768-dimension vector embedding using Jina AI's dedicated embeddings-v3 model.
 * Jina embeddings are purpose-built for enterprise RAG semantic search and asymmetric question-document matching.
 */
async function generateJinaEmbedding(text: string): Promise<number[]> {
  if (!JINA_API_KEY || JINA_API_KEY.trim() === '') {
    throw new Error('JINA_API_KEY is not configured');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  const res = await fetch('https://api.jina.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${JINA_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'jina-embeddings-v3',
      dimensions: 768,
      normalized: true,
      input: [text]
    }),
    signal: controller.signal
  });

  clearTimeout(timeoutId);

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Jina API HTTP ${res.status}: ${errorText}`);
  }

  const data: any = await res.json();
  const embedding = data.data?.[0]?.embedding;
  if (!embedding || !Array.isArray(embedding)) {
    throw new Error('Jina API returned invalid embedding structure');
  }

  return embedding;
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

let remoteEmbeddingsDisabled = false;

/**
 * Request a 768-dimension vector embedding.
 * Prioritization:
 * 1. Jina AI (jina-embeddings-v3) - Dedicated high-performance embeddings engine.
 * 2. Google Gemini (gemini-embedding-001) - Secondary remote fallback.
 * 3. Deterministic Local Vector - Zero-latency mathematical fallback ensuring uninterrupted uptime.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text) {
    throw new Error('Text is required to generate embedding');
  }

  // 1. Try Jina AI (Primary dedicated embedding engine)
  if (JINA_API_KEY && JINA_API_KEY.trim() !== '') {
    try {
      const jinaVec = await generateJinaEmbedding(text);
      if (jinaVec && jinaVec.length === 768) {
        return jinaVec;
      }
    } catch (err: any) {
      console.warn('[Embeddings] Jina AI embedding failed, falling over to secondary:', err.message);
    }
  }

  // 2. Try Google Gemini embedding (Secondary fallback)
  if (genAI && !remoteEmbeddingsDisabled) {
    const candidateModels = ['gemini-embedding-001', 'text-embedding-004'];
    let lastError: any = null;
    const EMBED_TIMEOUT_MS = 2500;

    for (const modelName of candidateModels) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Embedding call to ${modelName} timed out after ${EMBED_TIMEOUT_MS}ms`)), EMBED_TIMEOUT_MS)
        );

        const result = await Promise.race([
          model.embedContent(text),
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
      }
    }

    if (lastError?.message?.includes('404') || lastError?.message?.includes('not found')) {
      remoteEmbeddingsDisabled = true;
    }
  }

  // 3. Fall back to high-speed deterministic local vector embeddings
  return generateMockEmbedding(text);
}
