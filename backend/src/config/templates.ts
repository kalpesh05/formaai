export interface TemplatePreset {
  template_type: 'support' | 'sales';
  llm_provider: string;
  llm_model: string;
  config: Record<string, any>;
  tools: { tool_type: 'ticket_create' | 'calendar_booking'; tool_config: Record<string, any> }[];
}

export const TEMPLATES: Record<'support' | 'sales', TemplatePreset> = {
  support: {
    template_type: 'support',
    llm_provider: 'anthropic',
    llm_model: 'claude-3-5-sonnet-latest',
    config: {
      systemPrompt: 'You are a helpful customer support agent. Answer queries using the context from our knowledge base. If you cannot find the answer or if the user requests escalation, use the create_support_ticket tool.',
    },
    tools: [
      {
        tool_type: 'ticket_create',
        tool_config: {}
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
