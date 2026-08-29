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
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Client workspaces (belongs to one agency)
CREATE TABLE IF NOT EXISTS client_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_workspaces_agency ON client_workspaces(agency_id);

-- Agents (one per client workspace, built from a template)
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_workspace_id UUID NOT NULL REFERENCES client_workspaces(id) ON DELETE CASCADE,
  template_type TEXT NOT NULL CHECK (template_type IN ('support', 'sales')),
  name TEXT NOT NULL,
  llm_provider TEXT NOT NULL DEFAULT 'anthropic',
  llm_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live', 'paused')),
  config JSONB NOT NULL DEFAULT '{}',
  api_key TEXT UNIQUE, -- issued on deploy, used by widget
  created_at TIMESTAMPTZ DEFAULT now()
);
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
  tool_type TEXT NOT NULL CHECK (tool_type IN ('calendar_booking', 'ticket_create')),
  tool_config JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN DEFAULT true
);
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

-- Support Tickets (filed by Support Agent tools)
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tickets_agent ON tickets(agent_id);
