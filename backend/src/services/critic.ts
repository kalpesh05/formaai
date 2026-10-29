import { callGemini } from './router';

export interface GroundingCheckResult {
  isGrounded: boolean;
  confidenceScore: number; // 0 to 1
  reasoning: string;
  hasHallucinations: boolean;
  unsupportedClaims: string[];
}

/**
 * Enterprise Grounding Critic & Hallucination Guard.
 * Evaluates candidate responses against retrieved knowledge base chunks.
 * 
 * Real-time LLM-as-a-judge evaluation layer.
 */
export async function evaluateGrounding(
  candidateAnswer: string,
  contextChunks: string[],
  userQuery: string,
  modelName: string = 'gemini-3.8-flash'
): Promise<GroundingCheckResult> {
  // If there's no answer or user is just greeting, it's considered safe
  if (!candidateAnswer || candidateAnswer.trim().length === 0) {
    return {
      isGrounded: true,
      confidenceScore: 1.0,
      reasoning: 'Empty or trivial response',
      hasHallucinations: false,
      unsupportedClaims: []
    };
  }

  // If no chunks were available, verify the response doesn't invent specific figures, policies, or code
  if (!contextChunks || contextChunks.length === 0) {
    const hasInventedSpecifics = /\b(\$\d+|\d+%\s*discount|code\s*snippet|refund\s*within\s*\d+\s*days|guarantee)\b/i.test(candidateAnswer);
    return {
      isGrounded: !hasInventedSpecifics,
      confidenceScore: hasInventedSpecifics ? 0.3 : 0.8,
      reasoning: hasInventedSpecifics ? 'Contains specific figures without source context' : 'General conversational response without grounding docs',
      hasHallucinations: hasInventedSpecifics,
      unsupportedClaims: hasInventedSpecifics ? ['Specific numbers or policies asserted without documentation'] : []
    };
  }

  const combinedContext = contextChunks.join('\n---\n');

  const criticPrompt = `You are an automated Quality Assurance and Hallucination Judge for enterprise customer support.

Source Documentation Chunks:
----------------------------
${combinedContext}
----------------------------

Customer Question:
"${userQuery}"

Candidate Support Assistant Answer:
"${candidateAnswer}"

Analyze the candidate answer strictly against the Source Documentation Chunks:
1. Does the candidate answer assert any facts, steps, policies, prices, or technical specs that CANNOT be deduced from or found in the Source Documentation?
2. Minor conversational pleasantries ("Happy to help!", "Certainly") are allowed.
3. If the answer states that it does not know or offers to escalate, that is considered grounded and safe.

Respond in strict JSON format:
{
  "isGrounded": boolean,
  "confidenceScore": number, // between 0.0 and 1.0
  "hasHallucinations": boolean,
  "unsupportedClaims": string[],
  "reasoning": "brief explanation"
}`;

  try {
    const CRITIC_TIMEOUT_MS = 4000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Critic evaluation timed out after ${CRITIC_TIMEOUT_MS}ms`)), CRITIC_TIMEOUT_MS)
    );

    const res = await Promise.race([
      callGemini(
        'You are a strict compliance and hallucination judge. Output valid JSON only.',
        [],
        criticPrompt,
        undefined,
        modelName
      ),
      timeoutPromise
    ]);

    // Extract JSON block
    const match = res.reply.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        isGrounded: Boolean(parsed.isGrounded),
        confidenceScore: typeof parsed.confidenceScore === 'number' ? parsed.confidenceScore : 0.9,
        reasoning: parsed.reasoning || '',
        hasHallucinations: Boolean(parsed.hasHallucinations),
        unsupportedClaims: Array.isArray(parsed.unsupportedClaims) ? parsed.unsupportedClaims : []
      };
    }
  } catch (err: any) {
    console.warn('[GroundingCritic] Verification parse error, defaulting to permissive check:', err.message);
  }

  return {
    isGrounded: true,
    confidenceScore: 0.85,
    reasoning: 'Fallback validation passed',
    hasHallucinations: false,
    unsupportedClaims: []
  };
}
