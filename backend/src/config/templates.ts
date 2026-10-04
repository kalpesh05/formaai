export type TemplateType = 'support' | 'sales' | 'hr' | 'backend_dev' | 'frontend_dev' | 'qa_tester' | 'router';

export type ToolType = 
  | 'ticket_create' 
  | 'calendar_booking' 
  | 'database_query' 
  | 'sentry_telemetry' 
  | 'github_pr' 
  | 'code_sandbox' 
  | 'handoff_agent';

export interface TemplatePreset {
  template_type: TemplateType;
  title: string;
  description: string;
  department: 'support' | 'sales' | 'hr' | 'engineering' | 'qa' | 'operations';
  llm_provider: string;
  llm_model: string;
  config: Record<string, any>;
  tools: { tool_type: ToolType; tool_config: Record<string, any> }[];
}

export const TEMPLATES: Record<TemplateType, TemplatePreset> = {
  support: {
    template_type: 'support',
    title: 'Customer Support Engineer',
    description: 'Diagnoses user complaints, answers product FAQs, and creates escalation tickets with error traces.',
    department: 'support',
    llm_provider: 'gemini',
    llm_model: 'gemini-3.8-flash',
    config: {
      systemPrompt: 'You are an intelligent customer support engineer. Ground your answers strictly in our verified documentation and codebase. If the user asks about payments, plans, or account state, use the query_user_account tool to check live database status. If the user reports a bug, white screen, or crash, use the check_recent_telemetry_errors tool to inspect recent stack traces. If you cannot solve the issue, use create_support_ticket.',
    },
    tools: [
      {
        tool_type: 'ticket_create',
        tool_config: {}
      },
      {
        tool_type: 'database_query',
        tool_config: {
          description: 'Read-only live database & billing verification',
          endpoint_mode: 'simulated_or_webhook'
        }
      },
      {
        tool_type: 'sentry_telemetry',
        tool_config: {
          description: 'Sentry application error trace & crash correlator',
          telemetry_mode: 'simulated_or_sentry'
        }
      }
    ]
  },
  sales: {
    template_type: 'sales',
    title: 'Sales & Lead Assistant',
    description: 'Engages inbound leads, answers pricing and capability questions, and books qualified demos on Cal.com.',
    department: 'sales',
    llm_provider: 'gemini',
    llm_model: 'gemini-3.8-flash',
    config: {
      systemPrompt: 'You are a helpful sales assistant. Answer pricing and feature questions using the context. If the user wants a demo, call or booking, use the book_calendar_slot tool.',
    },
    tools: [
      {
        tool_type: 'calendar_booking',
        tool_config: {}
      }
    ]
  },
  hr: {
    template_type: 'hr',
    title: 'HR & People Operations Concierge',
    description: 'Internal 24/7 staff assistant for leave policy, benefits, holiday schedules, and workplace guidelines.',
    department: 'hr',
    llm_provider: 'gemini',
    llm_model: 'gemini-3.8-flash',
    config: {
      systemPrompt: 'You are an internal People Operations & HR Concierge. Answer internal company policy questions strictly based on uploaded employee guidelines, leave rules, and benefit documents. If an employee requests leave or formal HR action, structure the request and create an internal ticket.',
    },
    tools: [
      {
        tool_type: 'ticket_create',
        tool_config: { category: 'hr' }
      },
      {
        tool_type: 'calendar_booking',
        tool_config: { type: 'hr_review' }
      }
    ]
  },
  backend_dev: {
    template_type: 'backend_dev',
    title: 'Autonomous Backend Engineer',
    description: 'Diagnoses API crashes, writes reproduction unit tests, inspects queries, and drafts code patches/PRs.',
    department: 'engineering',
    llm_provider: 'gemini',
    llm_model: 'gemini-3.1-pro',
    config: {
      systemPrompt: 'You are an autonomous Backend Software Engineer specializing in Node.js, Express, TypeScript, and SQL databases. When assigned a bug or ticket, analyze the stack trace and code logic, generate an automated reproduction test (Jest/Vitest), and create a minimal patch diff.',
    },
    tools: [
      {
        tool_type: 'database_query',
        tool_config: { read_only: true }
      },
      {
        tool_type: 'sentry_telemetry',
        tool_config: {}
      },
      {
        tool_type: 'github_pr',
        tool_config: {}
      }
    ]
  },
  frontend_dev: {
    template_type: 'frontend_dev',
    title: 'Autonomous Frontend UI Engineer',
    description: 'Diagnoses React & Tailwind CSS defects, component crashes, responsive issues, and drafts component fixes.',
    department: 'engineering',
    llm_provider: 'gemini',
    llm_model: 'gemini-3.1-pro',
    config: {
      systemPrompt: 'You are an autonomous Frontend UI/UX Engineer specializing in React, TypeScript, and Tailwind CSS. Diagnose component state issues, responsive layout bugs, and visual defects. Provide clean component fixes and verify CSS consistency.',
    },
    tools: [
      {
        tool_type: 'github_pr',
        tool_config: {}
      }
    ]
  },
  qa_tester: {
    template_type: 'qa_tester',
    title: 'QA & Test Automation Engineer',
    description: 'Generates automated test suites (Jest/Playwright), checks edge cases, and verifies PR diffs before deployment.',
    department: 'qa',
    llm_provider: 'gemini',
    llm_model: 'gemini-3.1-pro',
    config: {
      systemPrompt: 'You are an automated Quality Assurance and Test Automation Engineer. Given a bug report or proposed code patch, generate automated unit and integration tests. Verify edge cases (null inputs, boundary conditions, race conditions) and give a clear PASS or FAIL verdict.',
    },
    tools: [
      {
        tool_type: 'code_sandbox',
        tool_config: {}
      }
    ]
  },
  router: {
    template_type: 'router',
    title: 'Team Triage & Lead Orchestrator',
    description: 'Analyzes incoming tickets, classifies the root problem, assigns priority, and delegates to the right agent.',
    department: 'operations',
    llm_provider: 'gemini',
    llm_model: 'gemini-3.8-flash',
    config: {
      systemPrompt: 'You are the Lead Triage Orchestrator. When a ticket arrives, analyze its urgency, technical domain (support, hr, backend, frontend, qa), set the priority level (low, medium, high, urgent), and assign it to the most suitable specialized agent.',
    },
    tools: [
      {
        tool_type: 'handoff_agent',
        tool_config: {}
      }
    ]
  }
};
