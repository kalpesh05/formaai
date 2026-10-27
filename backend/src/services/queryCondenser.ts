import { callGemini, ChatMessage } from './router';

/**
 * Rewrites a follow-up user query into a standalone, search-optimized query
 * that preserves context from prior turns in the conversation.
 * 
 * Inspired by Decagon AI's multi-turn conversational comprehension layer.
 */
export async function condenseQuery(
  currentMessage: string,
  history: ChatMessage[],
  modelName: string = 'gemini-3.8-flash'
): Promise<string> {
  const cleanMessage = currentMessage.trim();
  
  // If there's no history or message is just a basic greeting, return as is
  if (!history || history.length === 0) {
    return cleanMessage;
  }

  // If message is obviously a standalone greeting or exit, don't rewrite
  if (/^(hi|hello|hey|good morning|good evening|thanks|thank you|bye)\b/i.test(cleanMessage)) {
    return cleanMessage;
  }

  // Take the last 4 turns for context
  const recentHistory = history.slice(-4);
  const formattedHistory = recentHistory
    .map(m => `${m.role === 'user' ? 'Customer' : 'Support Assistant'}: ${m.content}`)
    .join('\n');

  const rewritePrompt = `You are a conversational query rewriting specialist for enterprise customer support.
Your task is to rewrite the customer's latest follow-up message into an independent, self-contained search query.

Rules:
1. Resolve all pronouns (it, that, they, this, the latter, him, her) into their exact referents from the conversation.
2. If the user asks a brief question (e.g., "how much is it?", "can I do that on starter?"), include the specific product feature, tier, or policy discussed.
3. Output ONLY the standalone search query without quotes, explanations, or prefixes.
4. If the message is already standalone, return it verbatim.

Conversation History:
${formattedHistory}

Latest Customer Message:
"${cleanMessage}"

Standalone Search Query:`;

  try {
    const res = await callGemini(
      'You are a query rewriting model. Output ONLY the rewritten standalone search query.',
      [],
      rewritePrompt,
      undefined,
      modelName
    );

    const rewritten = res.reply.trim().replace(/^["']|["']$/g, '');
    if (rewritten && rewritten.length > 2 && !rewritten.includes('\n')) {
      return rewritten;
    }
  } catch (err: any) {
    console.warn('[QueryCondenser] Query rewrite failed, falling back to raw message:', err.message);
  }

  return cleanMessage;
}
