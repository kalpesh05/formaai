CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

-- Agencies (top-level tenant)
CREATE TABLE IF NOT EXISTS agencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  white_label_name TEXT,
  white_label_logo_url TEXT,
  role TEXT NOT NULL DEFAULT 'agency_user',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'agency_user';

-- Client workspaces (belongs to one agency)
CREATE TABLE IF NOT EXISTS client_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  website_url TEXT,
  industry TEXT,
  onboarding_status TEXT NOT NULL DEFAULT 'requested' CHECK (onboarding_status IN ('requested', 'configuring', 'ready_for_review', 'live', 'paused')),
  plan_tier TEXT NOT NULL DEFAULT 'growth' CHECK (plan_tier IN ('starter', 'growth', 'enterprise')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Safe migrations for existing client_workspaces table before indexes
ALTER TABLE client_workspaces ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE client_workspaces ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE client_workspaces ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE client_workspaces ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE client_workspaces ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE client_workspaces ADD COLUMN IF NOT EXISTS onboarding_status TEXT NOT NULL DEFAULT 'requested';
ALTER TABLE client_workspaces DROP CONSTRAINT IF EXISTS client_workspaces_plan_tier_check;
ALTER TABLE client_workspaces ADD COLUMN IF NOT EXISTS plan_tier TEXT NOT NULL DEFAULT 'trial';
ALTER TABLE client_workspaces ADD COLUMN IF NOT EXISTS billing_interval TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE client_workspaces ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '14 days');
ALTER TABLE client_workspaces ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'trialing';
ALTER TABLE client_workspaces ADD COLUMN IF NOT EXISTS monthly_message_count INT NOT NULL DEFAULT 0;
ALTER TABLE client_workspaces ADD COLUMN IF NOT EXISTS billing_cycle_start TIMESTAMPTZ DEFAULT now();
ALTER TABLE client_workspaces ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE client_workspaces ADD COLUMN IF NOT EXISTS feature_flags JSONB NOT NULL DEFAULT '{"forms": false, "mailbox": false, "tickets": false, "logs": false}';

CREATE INDEX IF NOT EXISTS idx_client_workspaces_agency ON client_workspaces(agency_id);
CREATE INDEX IF NOT EXISTS idx_client_workspaces_status ON client_workspaces(onboarding_status);

-- Agents (belongs to client workspace, built from a template)
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_workspace_id UUID NOT NULL REFERENCES client_workspaces(id) ON DELETE CASCADE,
  template_type TEXT NOT NULL CHECK (template_type IN ('support', 'sales', 'hr', 'backend_dev', 'frontend_dev', 'qa_tester', 'router')),
  name TEXT NOT NULL,
  llm_provider TEXT NOT NULL DEFAULT 'gemini',
  llm_model TEXT NOT NULL DEFAULT 'gemini-3.8-flash',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live', 'paused')),
  config JSONB NOT NULL DEFAULT '{}',
  api_key TEXT UNIQUE, -- issued on deploy, used by widget
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_template_type_check;
ALTER TABLE agents ADD CONSTRAINT agents_template_type_check 
  CHECK (template_type IN ('support', 'sales', 'hr', 'backend_dev', 'frontend_dev', 'qa_tester', 'router'));
CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents(client_workspace_id);

-- Data sources
CREATE TABLE IF NOT EXISTS data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('file', 'url')),
  source_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_data_sources_agent ON data_sources(agent_id);

-- Chunks + embeddings
CREATE TABLE IF NOT EXISTS chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  data_source_id UUID NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding VECTOR(768),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chunks_agent ON chunks(agent_id);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON chunks USING ivfflat (embedding vector_cosine_ops);

-- Connected action tools (per agent)
CREATE TABLE IF NOT EXISTS agent_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tool_type TEXT NOT NULL CHECK (tool_type IN ('calendar_booking', 'ticket_create', 'database_query', 'sentry_telemetry', 'github_pr', 'code_sandbox', 'handoff_agent')),
  tool_config JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN DEFAULT true
);
ALTER TABLE agent_tools DROP CONSTRAINT IF EXISTS agent_tools_tool_type_check;
ALTER TABLE agent_tools ADD CONSTRAINT agent_tools_tool_type_check 
  CHECK (tool_type IN ('calendar_booking', 'ticket_create', 'database_query', 'sentry_telemetry', 'github_pr', 'code_sandbox', 'handoff_agent'));
CREATE INDEX IF NOT EXISTS idx_agent_tools_agent ON agent_tools(agent_id);

-- Action log (audit trail)
CREATE TABLE IF NOT EXISTS action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  action_input JSONB,
  action_result JSONB,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_action_logs_agent ON action_logs(agent_id);

-- Conversations + messages
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  end_user_ref TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conversations_agent ON conversations(agent_id);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

-- Support & Work Tickets (filed by users or agents)
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  assigned_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT 'support',
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  automated_status TEXT NOT NULL DEFAULT 'idle',
  resolution_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assigned_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT 'support';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS automated_status TEXT NOT NULL DEFAULT 'idle';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolution_summary TEXT;
CREATE INDEX IF NOT EXISTS idx_tickets_agent ON tickets(agent_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_agent ON tickets(assigned_agent_id);

-- Evaluation Suite Runs (Benchmark verification before production)
CREATE TABLE IF NOT EXISTS evaluation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  dataset_name TEXT NOT NULL DEFAULT 'Custom Benchmark',
  total_tests INT NOT NULL DEFAULT 0,
  passed_tests INT NOT NULL DEFAULT 0,
  accuracy_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  avg_similarity NUMERIC(5, 4) NOT NULL DEFAULT 0.0000,
  hallucination_count INT NOT NULL DEFAULT 0,
  low_confidence_count INT NOT NULL DEFAULT 0,
  results JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_evaluation_runs_agent ON evaluation_runs(agent_id);

-- Copilot / Shadow Mode Drafts (Human-in-the-loop review before client delivery)
CREATE TABLE IF NOT EXISTS copilot_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  user_query TEXT NOT NULL,
  draft_reply TEXT NOT NULL,
  confidence_score NUMERIC(5, 4) NOT NULL DEFAULT 0.0000,
  citations JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'edited')),
  edited_reply TEXT,
  reviewed_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_copilot_drafts_agent ON copilot_drafts(agent_id);

-- Autonomous Auto-Fix Pull Requests (Path B)
CREATE TABLE IF NOT EXISTS autofix_prs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  bug_description TEXT NOT NULL,
  error_trace TEXT,
  target_file TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  github_pr_url TEXT,
  github_pr_number INT,
  reproduction_test TEXT NOT NULL,
  patch_diff TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'approved', 'merged', 'rejected')),
  environments JSONB NOT NULL DEFAULT '["dev", "stage"]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_autofix_prs_agent ON autofix_prs(agent_id);

-- Workspace Support Mailbox Configurations
ALTER TABLE client_workspaces ADD COLUMN IF NOT EXISTS mailbox_forwarding_address TEXT;
ALTER TABLE client_workspaces ADD COLUMN IF NOT EXISTS mailbox_support_email TEXT;
ALTER TABLE client_workspaces ADD COLUMN IF NOT EXISTS mailbox_mode TEXT NOT NULL DEFAULT 'copilot';
ALTER TABLE client_workspaces ADD COLUMN IF NOT EXISTS mailbox_auto_threshold NUMERIC(5, 4) NOT NULL DEFAULT 0.7500;
ALTER TABLE client_workspaces ADD COLUMN IF NOT EXISTS mailbox_assigned_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL;

-- Support Mailbox Threads (Aggregates ongoing customer email conversations)
CREATE TABLE IF NOT EXISTS mailbox_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_workspace_id UUID NOT NULL REFERENCES client_workspaces(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved', 'closed')),
  ai_status TEXT NOT NULL DEFAULT 'needs_review' CHECK (ai_status IN ('auto_replied', 'draft_ready', 'needs_review', 'manual_handled', 'failed')),
  last_message_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mailbox_threads_workspace ON mailbox_threads(client_workspace_id);
CREATE INDEX IF NOT EXISTS idx_mailbox_threads_agent ON mailbox_threads(agent_id);
CREATE INDEX IF NOT EXISTS idx_mailbox_threads_status ON mailbox_threads(status);
CREATE INDEX IF NOT EXISTS idx_mailbox_threads_customer_email ON mailbox_threads(customer_email);

-- Support Mailbox Messages (Inbound and outbound email messages within threads)
CREATE TABLE IF NOT EXISTS mailbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES mailbox_threads(id) ON DELETE CASCADE,
  message_id_header TEXT,
  in_reply_to_header TEXT,
  references_header TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_email TEXT NOT NULL,
  sender_name TEXT,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  body_html TEXT,
  ai_generated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mailbox_messages_thread ON mailbox_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_mailbox_messages_header ON mailbox_messages(message_id_header);

-- Link copilot drafts to mailbox threads for review before outbound email delivery
ALTER TABLE copilot_drafts ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES mailbox_threads(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_copilot_drafts_thread ON copilot_drafts(thread_id);

-- Forma AI Forms and Dynamic Data Collection Suite
CREATE TABLE IF NOT EXISTS forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_workspace_id UUID NOT NULL REFERENCES client_workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  display_mode TEXT NOT NULL DEFAULT 'classic' CHECK (display_mode IN ('classic', 'one_by_one')),
  fields JSONB NOT NULL DEFAULT '[]',
  settings JSONB NOT NULL DEFAULT '{}',
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_forms_workspace ON forms(client_workspace_id);
CREATE INDEX IF NOT EXISTS idx_forms_published ON forms(is_published);

CREATE TABLE IF NOT EXISTS form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  client_workspace_id UUID NOT NULL REFERENCES client_workspaces(id) ON DELETE CASCADE,
  answers JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'archived')),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form ON form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_workspace ON form_submissions(client_workspace_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_created ON form_submissions(created_at);
CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default global module lifecycle if not present
INSERT INTO platform_settings (key, value)
VALUES (
  'module_lifecycle',
  '{
    "forms": { "status": "beta", "min_plan": "growth", "name": "Forma AI Form Builder", "description": "Conversational & classic lead capture forms" },
    "mailbox": { "status": "beta", "min_plan": "business", "name": "Support Mailbox & Copilot", "description": "Email ticketing & AI auto-responder" },
    "tickets": { "status": "beta", "min_plan": "business", "name": "Customer Ticket Helpdesk", "description": "Multi-channel support escalation" },
    "logs": { "status": "internal", "min_plan": "enterprise", "name": "Execution Telemetry & Traces", "description": "Deep LLM request logs and self-healing" }
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;
