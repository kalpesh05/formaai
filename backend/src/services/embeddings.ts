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
 * Request a 768-dimension vector embedding using Gemini text-embedding-004.
 * Falls back to generateMockEmbedding if no valid API key is present in environment variables.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text) {
    throw new Error('Text is required to generate embedding');
  }

  if (!genAI) {
    return generateMockEmbedding(text);
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const result = await model.embedContent(text);
    if (!result.embedding || !result.embedding.values) {
      throw new Error('Invalid response structure from Gemini Embedding API');
    }
    return result.embedding.values;
  } catch (err: any) {
    console.error('Gemini Embedding API call failed. Falling back to mock. Error:', err.message);
    return generateMockEmbedding(text);
  }
}
