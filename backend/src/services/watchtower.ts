import { callGemini, ChatMessage } from './router';

export interface WatchtowerRiskAssessment {
  isHighRisk: boolean;
  riskCategory?: 'legal' | 'chargeback' | 'hostility' | 'executive_complaint';
  severity: 'critical' | 'high' | 'normal';
  circuitBreakerTriggered: boolean;
  disarmingReply?: string;
  reason?: string;
}

export interface WarmHandoffBrief {
  customerProblem: string;
  actionsAttempted: string;
  recommendedAction: string;
  formattedBrief: string;
}

// High-risk legal triggers (lawsuits, attorneys, consumer protection agencies)
const LEGAL_PATTERNS = [
  /\b(lawyer|attorney|lawsuit|sue you|suing|legal counsel|legal action|litigation|ftc|gdpr violation|better business bureau|bbb complaint|small claims)\b/i
];

// High-risk chargeback / payment dispute triggers
const CHARGEBACK_PATTERNS = [
  /\b(chargeback|credit card fraud|bank dispute|dispute the charge|call my bank|reverse the transaction|stolen card)\b/i
];

// Severe customer hostility triggers
const HOSTILITY_PATTERNS = [
  /\b(scam|thieves|fraudulent company|rip off|fucking|bastards|bullshit|scammers)\b/i
];

/**
 * Watchtower: Real-time risk detection and circuit breaker.
 * Evaluates inbound customer turns before AI generation to prevent brand disasters,
 * legal exposure, or infuriating high-churn customers.
 */
export function assessRiskAndSentiment(message: string): WatchtowerRiskAssessment {
  const clean = message.trim();

  // 1. Legal Risk Check
  for (const pattern of LEGAL_PATTERNS) {
    if (pattern.test(clean)) {
      return {
        isHighRisk: true,
        riskCategory: 'legal',
        severity: 'critical',
        circuitBreakerTriggered: true,
        reason: 'Customer referenced legal action or regulatory escalation',
        disarmingReply: 'I understand the seriousness of this matter. Rather than an automated assistant response, I have immediately escalated this to our senior management and legal operations team. A dedicated representative is reviewing your file and will contact you directly.'
      };
    }
  }

  // 2. Chargeback / Dispute Check
  for (const pattern of CHARGEBACK_PATTERNS) {
    if (pattern.test(clean)) {
      return {
        isHighRisk: true,
        riskCategory: 'chargeback',
        severity: 'critical',
        circuitBreakerTriggered: true,
        reason: 'Customer threatened payment chargeback or disputed charges',
        disarmingReply: 'I completely understand your concern regarding this charge. To resolve this without delay or bank dispute fees, I have flagged your account with our billing supervisors for immediate review and resolution.'
      };
    }
  }

  // 3. Severe Hostility Check
  for (const pattern of HOSTILITY_PATTERNS) {
    if (pattern.test(clean)) {
      return {
        isHighRisk: true,
        riskCategory: 'hostility',
        severity: 'high',
        circuitBreakerTriggered: true,
        reason: 'Customer indicated extreme frustration or abusive sentiment',
        disarmingReply: 'I truly apologize for this frustrating experience. I am escalating your request directly to a senior customer support specialist right now so you receive immediate, personal assistance.'
      };
    }
  }

  return {
    isHighRisk: false,
    severity: 'normal',
    circuitBreakerTriggered: false
  };
}

/**
 * Generates an automated enterprise 3-bullet AI briefing for human agents
 * when an escalation or handoff occurs.
 */
export async function generateWarmHandoffBrief(
  userMessage: string,
  history: ChatMessage[],
  actionsTaken: any[] = [],
  modelName: string = 'gemini-3.8-flash'
): Promise<WarmHandoffBrief> {
  const recentTurns = history.slice(-6);
  const conversationText = recentTurns.map(m => `${m.role === 'user' ? 'Customer' : 'Bot'}: ${m.content}`).join('\n');
  const actionsSummary = actionsTaken.length > 0 ? JSON.stringify(actionsTaken) : 'None';

  const prompt = `You are an AI Support Coordinator preparing a concise handoff briefing for a human support agent.

Conversation Transcript:
${conversationText}
Latest Customer Message: "${userMessage}"
Automated Actions Fired: ${actionsSummary}

Generate a concise 3-bullet briefing in this exact JSON structure:
{
  "customerProblem": "1 clear sentence explaining what went wrong or what the user needs",
  "actionsAttempted": "1 clear sentence describing what the bot checked or did",
  "recommendedAction": "1 clear actionable recommendation for the human agent"
}
`;

  try {
    const BRIEF_TIMEOUT_MS = 4000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Warm handoff briefing timed out after ${BRIEF_TIMEOUT_MS}ms`)), BRIEF_TIMEOUT_MS)
    );

    const res = await Promise.race([
      callGemini(
        'You are an executive support coordinator. Respond in valid JSON only.',
        [],
        prompt,
        undefined,
        modelName
      ),
      timeoutPromise
    ]);

    const match = res.reply.match(/\{[\s\S]*\}/);
    if (match) {
      const data = JSON.parse(match[0]);
      const formatted = `📋 **AI Context Briefing (Warm Transfer)**:
• **Customer Problem**: ${data.customerProblem || userMessage}
• **Actions Attempted**: ${data.actionsAttempted || 'Verified knowledge base and account history.'}
• **Recommended Next Step**: ${data.recommendedAction || 'Review customer profile and follow up directly.'}`;

      return {
        customerProblem: data.customerProblem || userMessage,
        actionsAttempted: data.actionsAttempted || '',
        recommendedAction: data.recommendedAction || '',
        formattedBrief: formatted
      };
    }
  } catch (err: any) {
    console.warn('[Watchtower] Failed to generate handoff brief:', err.message);
  }

  const defaultBrief = `📋 **AI Context Briefing (Warm Transfer)**:
• **Customer Problem**: ${userMessage.slice(0, 150)}
• **Actions Attempted**: Knowledge lookup and initial troubleshooting.
• **Recommended Next Step**: Follow up with customer directly via email/dashboard.`;

  return {
    customerProblem: userMessage,
    actionsAttempted: 'Knowledge lookup and initial troubleshooting.',
    recommendedAction: 'Follow up with customer directly.',
    formattedBrief: defaultBrief
  };
}
