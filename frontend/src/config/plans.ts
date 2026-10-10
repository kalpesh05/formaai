export interface PlanInfo {
  id: 'trial' | 'starter' | 'growth' | 'business' | 'enterprise';
  name: string;
  tagline: string;
  monthlyPrice: number;
  yearlyMonthlyPrice: number; // Discounted monthly price when billed annually
  maxAgents: number;
  monthlyMessageLimit: number;
  maxForms: number;
  maxIngestUrls: number;
  whiteLabel: boolean;
  customColors: boolean;
  highlight?: boolean;
  badge?: string;
  features: string[];
}

export const PLANS_CONFIG: PlanInfo[] = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Instant 24/7 AI Receptionist for websites & landing pages',
    monthlyPrice: 29,
    yearlyMonthlyPrice: 24, // $288/year
    maxAgents: 1,
    monthlyMessageLimit: 1000,
    maxForms: 0,
    maxIngestUrls: 20,
    whiteLabel: false,
    customColors: false,
    features: [
      '1 Dedicated AI Chatbot & Agent',
      '1,000 AI Conversations / month',
      '20 Website Pages or 10 MB Docs Ingested',
      'Instant Embeddable Chat Widget',
      'Basic Persona, Tone & Knowledge Grounding',
      'Community & Standard Email Support',
    ],
  },
  {
    id: 'growth',
    name: 'Growth (Pro)',
    tagline: 'Scale customer engagement with custom colors & lead forms',
    monthlyPrice: 79,
    yearlyMonthlyPrice: 65, // $780/year
    maxAgents: 3,
    monthlyMessageLimit: 5000,
    maxForms: 5,
    maxIngestUrls: 100,
    whiteLabel: false,
    customColors: true,
    highlight: true,
    badge: 'Most Popular',
    features: [
      'Up to 3 Autonomous AI Chatbots & Agents',
      '5,000 AI Conversations / month',
      '100 Web Pages, Full Sitemap Crawling & 50 MB Docs',
      'Custom Brand Colors, Launcher & Avatar',
      'Forma AI Form Builder Included (Up to 5 Forms)',
      'Visitor Geolocation & Submission Analytics',
      'Priority Email & Agent Configuration Support',
    ],
  },
  {
    id: 'business',
    name: 'Business Suite',
    tagline: 'Complete automated front-office with full white-labeling',
    monthlyPrice: 199,
    yearlyMonthlyPrice: 165, // $1,980/year
    maxAgents: 999, // Unlimited
    monthlyMessageLimit: 20000,
    maxForms: 999,
    maxIngestUrls: 9999,
    whiteLabel: true,
    customColors: true,
    badge: 'Full Suite',
    features: [
      'Unlimited AI Chatbots & Multi-Agent Swarms',
      '20,000 AI Conversations / month',
      'Unlimited Knowledge Base Ingestion & Auto-Resync',
      '100% White-Label (Remove "Powered by Forma AI")',
      'Support Mailbox Connector & AI Auto-Responder',
      'Customer Helpdesk & Multi-Channel Ticket Escalation',
      'Cal.com Demo Booking & Custom Tool Actions',
      'Dedicated Customer Success Specialist',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Mission-critical volume, dedicated LLM BYOK & SLAs',
    monthlyPrice: 499,
    yearlyMonthlyPrice: 415,
    maxAgents: 999,
    monthlyMessageLimit: 50000,
    maxForms: 999,
    maxIngestUrls: 9999,
    whiteLabel: true,
    customColors: true,
    badge: 'High Scale',
    features: [
      'Custom AI Conversation Quota (50,000+ / mo)',
      'Deep Execution Telemetry, Traces & Auto-Fix PRs',
      'Bring Your Own Key (BYOK: Azure OpenAI / Vertex)',
      'Custom Domain Widget Hosting (e.g. chat.yourbrand.com)',
      '99.9% Uptime SLA & Dedicated Slack/Teams Channel',
      'Custom Contract, Invoicing & Security Review',
    ],
  },
];
