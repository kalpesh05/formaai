export interface PlanDefinition {
  id: 'trial' | 'starter' | 'growth' | 'business' | 'enterprise';
  name: string;
  tagline: string;
  monthlyPrice: number;
  yearlyMonthlyPrice: number; // discounted rate per month when billed annually
  maxAgents: number;
  monthlyMessageLimit: number;
  maxForms: number;
  maxIngestUrls: number;
  whiteLabel: boolean;
  customColors: boolean;
  rank: number; // for tier comparison
  highlight?: boolean;
}

export const PLAN_RANKS: Record<string, number> = {
  starter: 1,
  growth: 2,
  business: 3,
  enterprise: 4,
  trial: 2, // Trial simulates Growth tier capabilities
};

export const PLANS: Record<string, PlanDefinition> = {
  trial: {
    id: 'trial',
    name: '14-Day Free Trial',
    tagline: 'Experience the full power of Forma AI risk-free',
    monthlyPrice: 0,
    yearlyMonthlyPrice: 0,
    maxAgents: 1,
    monthlyMessageLimit: 300,
    maxForms: 1,
    maxIngestUrls: 5,
    whiteLabel: false,
    customColors: true,
    rank: 2,
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    tagline: 'Essential AI Chatbot for individual websites and blogs',
    monthlyPrice: 29,
    yearlyMonthlyPrice: 24, // $288/yr (Save 17%)
    maxAgents: 1,
    monthlyMessageLimit: 1000,
    maxForms: 0,
    maxIngestUrls: 20,
    whiteLabel: false,
    customColors: false,
    rank: 1,
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    tagline: 'High-performing AI Agent with custom branding & lead capture',
    monthlyPrice: 79,
    yearlyMonthlyPrice: 65, // $780/yr (Save ~18%)
    maxAgents: 3,
    monthlyMessageLimit: 5000,
    maxForms: 5,
    maxIngestUrls: 100,
    whiteLabel: false,
    customColors: true,
    rank: 2,
    highlight: true,
  },
  business: {
    id: 'business',
    name: 'Business Suite',
    tagline: 'Complete automated front-office with full white-labeling',
    monthlyPrice: 199,
    yearlyMonthlyPrice: 165, // $1,980/yr (Save ~17%)
    maxAgents: 999, // Unlimited
    monthlyMessageLimit: 20000,
    maxForms: 999, // Unlimited
    maxIngestUrls: 9999,
    whiteLabel: true,
    customColors: true,
    rank: 3,
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Custom volume, dedicated observability & SLA support',
    monthlyPrice: 499,
    yearlyMonthlyPrice: 415,
    maxAgents: 999,
    monthlyMessageLimit: 50000,
    maxForms: 999,
    maxIngestUrls: 9999,
    whiteLabel: true,
    customColors: true,
    rank: 4,
  },
};

export interface ModuleLifecycleConfig {
  status: 'internal' | 'beta' | 'live';
  min_plan: 'starter' | 'growth' | 'business' | 'enterprise';
  name: string;
  description: string;
}

export type GlobalModules = Record<string, ModuleLifecycleConfig>;

export const DEFAULT_MODULE_LIFECYCLE: GlobalModules = {
  forms: {
    status: 'beta',
    min_plan: 'growth',
    name: 'Forma AI Form Builder',
    description: 'Conversational & classic lead capture forms',
  },
  mailbox: {
    status: 'beta',
    min_plan: 'business',
    name: 'Support Mailbox & Copilot',
    description: 'Email ticketing & AI auto-responder',
  },
  tickets: {
    status: 'beta',
    min_plan: 'business',
    name: 'Customer Ticket Helpdesk',
    description: 'Multi-channel support escalation',
  },
  logs: {
    status: 'internal',
    min_plan: 'enterprise',
    name: 'Execution Telemetry & Traces',
    description: 'Deep LLM request logs and self-healing',
  },
};

export function getPlanDefinition(planTier?: string): PlanDefinition {
  const normalized = (planTier || 'trial').toLowerCase();
  return PLANS[normalized] || PLANS.trial;
}

export function isPlanSufficient(currentPlanTier: string, requiredPlanTier: string): boolean {
  const currentRank = PLAN_RANKS[currentPlanTier.toLowerCase()] || 1;
  const requiredRank = PLAN_RANKS[requiredPlanTier.toLowerCase()] || 1;
  return currentRank >= requiredRank;
}
