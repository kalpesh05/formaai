export interface TemplatePreset {
  template_type: 'support' | 'sales';
  llm_provider: string;
  llm_model: string;
  config: Record<string, any>;
  tools: { tool_type: 'ticket_create' | 'calendar_booking' | 'database_query' | 'sentry_telemetry'; tool_config: Record<string, any> }[];
}

export const TEMPLATES: Record<'support' | 'sales', TemplatePreset> = {
  support: {
    template_type: 'support',
    llm_provider: 'anthropic',
    llm_model: 'claude-3-5-sonnet-latest',
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
    llm_provider: 'anthropic',
    llm_model: 'claude-3-5-sonnet-latest',
    config: {
      systemPrompt: 'You are a helpful sales assistant. Answer pricing and feature questions using the context. If the user wants a demo, call or booking, use the book_calendar_slot tool.',
    },
    tools: [
      {
        tool_type: 'calendar_booking',
        tool_config: {}
      }
    ]
  }
};
