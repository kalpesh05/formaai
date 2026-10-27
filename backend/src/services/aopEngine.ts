export interface AOPProcedure {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  mandatoryVariables?: string[];
  steps: string[];
  guardrails: string[];
  escalationConditions: string[];
}

export const DEFAULT_AOPS: AOPProcedure[] = [
  {
    id: 'calendar_booking_aop',
    name: 'Schedule Demo & Meeting Booking',
    description: 'Handles requests to schedule calls, book product demos, or arrange consultation sessions.',
    keywords: ['book', 'schedule', 'demo', 'call', 'meeting', 'calendar', 'consultation'],
    mandatoryVariables: ['date (YYYY-MM-DD)', 'time (HH:MM)', 'attendee_email'],
    steps: [
      '1. Ask for or verify the preferred date, time slot, and email address if not already provided.',
      '2. When all parameters are gathered, trigger the "book_calendar_slot" function.',
      '3. Confirm the scheduled booking with the user and provide a clear calendar confirmation summary.'
    ],
    guardrails: [
      'Do not invent available time slots if the booking tool indicates a conflict.',
      'Always ensure the attendee email is a valid email format before calling the tool.'
    ],
    escalationConditions: [
      'User requests custom VIP in-person meeting.',
      'System tool reports repeated booking API failures.'
    ]
  },
  {
    id: 'ticket_escalation_aop',
    name: 'Human Support Handoff & Issue Escalation',
    description: 'Coordinates escalation to human agents when documentation is missing or customer requests human help.',
    keywords: ['human', 'agent', 'support team', 'escalate', 'representative', 'complaint', 'manager', 'speak to someone'],
    steps: [
      '1. Acknowledge the user concern with empathy and state that you are escalating to the appropriate human specialist.',
      '2. Summarize the user issue clearly in the subject and description.',
      '3. Execute the "create_support_ticket" tool call.',
      '4. Inform the customer of their ticket creation and estimated turnaround.'
    ],
    guardrails: [
      'Do not argue with the customer if they insist on speaking to a person.',
      'Do not make unauthorized promises regarding SLA resolution timeframes.'
    ],
    escalationConditions: [
      'Explicit customer request to talk to a person.',
      'Customer expresses severe dissatisfaction or threat of legal/chargeback action.'
    ]
  },
  {
    id: 'account_billing_aop',
    name: 'Account & Billing Diagnostic',
    description: 'Diagnoses subscription status, payment deductions, and plan tier limits.',
    keywords: ['charge', 'invoice', 'billing', 'subscription', 'upgrade', 'payment', 'deducted', 'plan'],
    steps: [
      '1. Identify the user email or identifier from the session context.',
      '2. Trigger "query_user_account" with query_type "billing" or "subscription".',
      '3. Explain the verified billing state clearly to the user based strictly on the tool result.'
    ],
    guardrails: [
      'Never reveal full credit card numbers or sensitive credentials.',
      'Do not process refunds without verifying the account eligibility first.'
    ],
    escalationConditions: [
      'User disputes an unauthorized transaction or fraudulent card usage.'
    ]
  }
];

/**
 * Matches user query and history against Agent Operating Procedures (AOPs).
 * If matched, formats the procedure into a high-priority system directive for Gemini.
 */
export function matchAOP(
  queryText: string,
  customAOPs?: AOPProcedure[]
): AOPProcedure | null {
  const allProcedures = customAOPs && customAOPs.length > 0
    ? [...customAOPs, ...DEFAULT_AOPS]
    : DEFAULT_AOPS;

  const normalized = queryText.toLowerCase();

  for (const proc of allProcedures) {
    const matched = proc.keywords.some(kw => normalized.includes(kw.toLowerCase()));
    if (matched) {
      return proc;
    }
  }

  return null;
}

/**
 * Renders an active AOP into strict agent behavioral instructions.
 */
export function formatAOPInstruction(aop: AOPProcedure): string {
  return `
========================================
ACTIVE AGENT OPERATING PROCEDURE (AOP): ${aop.name.toUpperCase()}
========================================
Description: ${aop.description}

MANDATORY PROCEDURE STEPS:
${aop.steps.join('\n')}

STRICT OPERATIONAL GUARDRAILS:
${aop.guardrails.map(g => `- ${g}`).join('\n')}

ESCALATION CRITERIA:
${aop.escalationConditions.map(e => `- ${e}`).join('\n')}
========================================
`;
}
