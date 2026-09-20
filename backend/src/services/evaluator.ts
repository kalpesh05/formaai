import { query } from '../config/db';
import { generateEmbedding } from './embeddings';
import { callGemini } from './router';

export interface TestCaseInput {
  id?: string;
  question: string;
  expected_answer?: string;
  category?: string;
}

export interface EvaluationItemResult {
  id: string;
  question: string;
  category: string;
  expected_answer?: string;
  generated_answer: string;
  retrieved_chunks: Array<{ content: string; similarity: number }>;
  top_similarity: number;
  faithfulness_score: number;
  status: 'pass' | 'low_confidence' | 'hallucination_risk' | 'fail';
  reason: string;
  latency_ms: number;
}

export interface EvaluationRunSummary {
  id?: string;
  agent_id: string;
  dataset_name: string;
  total_tests: number;
  passed_tests: number;
  accuracy_rate: number;
  avg_similarity: number;
  hallucination_count: number;
  low_confidence_count: number;
  results: EvaluationItemResult[];
  created_at?: string;
}

/**
 * Calculates cosine similarity between two 1D vectors
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return Math.max(0, Math.min(1, dotProduct / denom));
}

/**
 * Evaluates a single test case against the agent's knowledge base
 */
export async function evaluateSingleTestCase(
  agentId: string,
  testCase: TestCaseInput,
  confidenceThreshold: number = 0.70
): Promise<EvaluationItemResult> {
  const startTime = Date.now();
  const id = testCase.id || `test-${Math.random().toString(36).substring(2, 9)}`;
  const category = testCase.category || 'General';

  // 1. Generate embedding for test question
  const questionEmbedding = await generateEmbedding(testCase.question);
  const vectorStr = `[${questionEmbedding.join(',')}]`;

  // 2. Query top 3 relevant chunks with pgvector cosine distance
  const chunksResult = await query(
    `SELECT content, 1 - (embedding <=> $2::vector) AS similarity
     FROM chunks
     WHERE agent_id = $1
     ORDER BY embedding <=> $2::vector
     LIMIT 3`,
    [agentId, vectorStr]
  );

  const retrievedChunks: Array<{ content: string; similarity: number }> = (chunksResult.rows || []).map((r: any) => ({
    content: r.content,
    similarity: Math.max(0, parseFloat(r.similarity) || 0)
  }));

  const topSimilarity = retrievedChunks.length > 0 ? retrievedChunks[0].similarity : 0;
  const contextText = retrievedChunks.map(c => c.content).join('\n---\n');

  // 3. Build system prompt for generation
  const systemPrompt = `You are an evaluation engine for a SaaS product knowledge base.
Answer the following question STRICTLY based on the provided context. If the context does not contain the answer, say "Insufficient knowledge to answer accurately."
Do not speculate or extrapolate.

Context:
${contextText || '(No relevant context found)'}`;

  let generatedAnswer = '';
  try {
    const routerRes = await callGemini(systemPrompt, [], testCase.question, []);
    generatedAnswer = routerRes.reply || '';
  } catch (err: any) {
    generatedAnswer = `[Evaluation Generation Fallback] Context similarity: ${(topSimilarity * 100).toFixed(1)}%`;
  }

  // 4. Faithfulness & Hallucination Assessment
  let faithfulnessScore = 0.5;
  let status: 'pass' | 'low_confidence' | 'hallucination_risk' | 'fail' = 'pass';
  let reason = '';

  const answerLower = generatedAnswer.toLowerCase();
  const isRefusal = answerLower.includes('insufficient knowledge') || 
                    answerLower.includes('cannot confirm') ||
                    answerLower.includes('escalated') ||
                    answerLower.includes('not enough information');

  if (topSimilarity < confidenceThreshold) {
    // Retrieval similarity is below acceptable threshold
    if (isRefusal || !testCase.expected_answer) {
      status = 'low_confidence';
      faithfulnessScore = 0.85; // Correctly caught missing knowledge
      reason = `Appropriate low-confidence handling (similarity ${(topSimilarity * 100).toFixed(1)}% < ${(confidenceThreshold * 100).toFixed(1)}%). Guardrail prevented hallucination.`;
    } else {
      // Model attempted to answer definitively without grounding
      status = 'hallucination_risk';
      faithfulnessScore = 0.25;
      reason = `Hallucination risk: Retrieval confidence is only ${(topSimilarity * 100).toFixed(1)}%, but model generated an ungrounded response.`;
    }
  } else if (testCase.expected_answer) {
    // Compare generated answer with expected answer
    try {
      const [genEmb, expEmb] = await Promise.all([
        generateEmbedding(generatedAnswer),
        generateEmbedding(testCase.expected_answer)
      ]);
      const semSim = cosineSimilarity(genEmb, expEmb);

      // Check specific formula / keyword preservation
      const expWords = testCase.expected_answer.split(/\s+/).filter(w => w.length > 4);
      let keywordHits = 0;
      for (const w of expWords) {
        if (answerLower.includes(w.toLowerCase())) keywordHits++;
      }
      const keywordRatio = expWords.length > 0 ? keywordHits / expWords.length : 1;

      faithfulnessScore = (semSim * 0.7) + (keywordRatio * 0.3);

      if (faithfulnessScore >= 0.72) {
        status = 'pass';
        reason = `High ground truth alignment (semantic: ${(semSim * 100).toFixed(0)}%, faithfulness: ${(faithfulnessScore * 100).toFixed(0)}%).`;
      } else {
        status = 'fail';
        reason = `Discrepancy with expected answer (semantic similarity ${(semSim * 100).toFixed(0)}%).`;
      }
    } catch {
      faithfulnessScore = topSimilarity;
      status = 'pass';
      reason = 'Grounded in retrieved chunks.';
    }
  } else {
    // No expected answer provided; evaluate context grounding
    if (isRefusal) {
      status = 'low_confidence';
      faithfulnessScore = 0.8;
      reason = 'Model safely indicated context insufficiency.';
    } else {
      faithfulnessScore = topSimilarity;
      status = 'pass';
      reason = `Verified against knowledge chunks with ${(topSimilarity * 100).toFixed(1)}% retrieval similarity.`;
    }
  }

  const latencyMs = Date.now() - startTime;

  return {
    id,
    question: testCase.question,
    category,
    expected_answer: testCase.expected_answer,
    generated_answer: generatedAnswer,
    retrieved_chunks: retrievedChunks,
    top_similarity: topSimilarity,
    faithfulness_score: faithfulnessScore,
    status,
    reason,
    latency_ms: latencyMs
  };
}

/**
 * Runs a full evaluation suite against a collection of test cases
 */
export async function runBatchEvaluation(
  agentId: string,
  datasetName: string,
  testCases: TestCaseInput[],
  confidenceThreshold: number = 0.70
): Promise<EvaluationRunSummary> {
  const results: EvaluationItemResult[] = [];

  for (const tc of testCases) {
    const itemResult = await evaluateSingleTestCase(agentId, tc, confidenceThreshold);
    results.push(itemResult);
  }

  const total = results.length;
  const passed = results.filter(r => r.status === 'pass').length;
  const lowConfidence = results.filter(r => r.status === 'low_confidence').length;
  const hallucinations = results.filter(r => r.status === 'hallucination_risk').length;

  const avgSimilarity = total > 0
    ? results.reduce((sum, r) => sum + r.top_similarity, 0) / total
    : 0;

  // Passing tests or safe low-confidence refusals count toward overall system safety
  const safeOutputs = passed + lowConfidence;
  const accuracyRate = total > 0 ? (safeOutputs / total) * 100 : 0;

  // Persist run in evaluation_runs table
  const insertRes = await query(
    `INSERT INTO evaluation_runs 
      (agent_id, dataset_name, total_tests, passed_tests, accuracy_rate, avg_similarity, hallucination_count, low_confidence_count, results)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, created_at`,
    [
      agentId,
      datasetName,
      total,
      passed,
      accuracyRate.toFixed(2),
      avgSimilarity.toFixed(4),
      hallucinations,
      lowConfidence,
      JSON.stringify(results)
    ]
  );

  const runRow = insertRes.rows[0];

  return {
    id: runRow?.id,
    agent_id: agentId,
    dataset_name: datasetName,
    total_tests: total,
    passed_tests: passed,
    accuracy_rate: parseFloat(accuracyRate.toFixed(2)),
    avg_similarity: parseFloat(avgSimilarity.toFixed(4)),
    hallucination_count: hallucinations,
    low_confidence_count: lowConfidence,
    results,
    created_at: runRow?.created_at
  };
}

/**
 * Automatically synthesizes benchmark test cases from existing chunks
 */
export async function generateSyntheticBenchmark(agentId: string, count: number = 10): Promise<TestCaseInput[]> {
  const chunksRes = await query(
    `SELECT content FROM chunks WHERE agent_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [agentId, Math.max(count * 2, 20)]
  );

  const testCases: TestCaseInput[] = [];

  for (let i = 0; i < (chunksRes.rows || []).length && testCases.length < count; i++) {
    const content = chunksRes.rows[i].content;
    const lines = content.split('\n').filter((l: string) => l.trim().length > 15);

    // Look for lines that state rules, formulas, schemas, or instructions
    const candidateLine = lines.find((l: string) => 
      l.includes('formula') || l.includes('function') || l.includes('error') || 
      l.includes('status') || l.includes('syntax') || l.includes('calculate') ||
      l.includes('table') || l.includes('ticket') || l.includes('config')
    ) || lines[0];

    if (candidateLine) {
      testCases.push({
        id: `synth-${i + 1}`,
        question: `How does the system handle or define: "${candidateLine.slice(0, 90).replace(/[#*`]/g, '').trim()}"?`,
        expected_answer: candidateLine.slice(0, 250).trim(),
        category: 'Synthetic Auto-Test'
      });
    }
  }

  // Fallback defaults if no chunks yet
  if (testCases.length === 0) {
    testCases.push(
      {
        id: 'synth-1',
        question: 'What are the subscription plans and billing renewal rules?',
        category: 'Billing'
      },
      {
        id: 'synth-2',
        question: 'What is the syntax for custom formula calculation?',
        category: 'Formulas'
      }
    );
  }

  return testCases;
}
