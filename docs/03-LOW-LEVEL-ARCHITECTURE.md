# Forma AI — Low-Level Architecture

**This is the shared source of truth.** Any agent building against this system must match these contracts exactly. If a change is needed, flag it to whoever owns integration before diverging.

---

## 1. Database Schema (PostgreSQL + pgvector)

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

-- Agencies (top-level tenant)
CREATE TABLE agencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  white_label_name TEXT,
  white_label_logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Client workspaces (belongs to one agency)
CREATE TABLE client_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_client_workspaces_agency ON client_workspaces(agency_id);

-- Agents (one per client workspace, built from a template)
CREATE TABLE agents (
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
CREATE INDEX idx_agents_workspace ON agents(client_workspace_id);

-- Data sources
CREATE TABLE data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('file', 'url')),
  source_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_data_sources_agent ON data_sources(agent_id);

-- Chunks + embeddings
CREATE TABLE chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  data_source_id UUID NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_chunks_agent ON chunks(agent_id);
CREATE INDEX idx_chunks_embedding ON chunks USING ivfflat (embedding vector_cosine_ops);

-- Connected action tools (per agent)
CREATE TABLE agent_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tool_type TEXT NOT NULL CHECK (tool_type IN ('calendar_booking', 'ticket_create')),
  tool_config JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN DEFAULT true
);
CREATE INDEX idx_agent_tools_agent ON agent_tools(agent_id);

-- Action log (audit trail)
CREATE TABLE action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  action_input JSONB,
  action_result JSONB,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_action_logs_agent ON action_logs(agent_id);

-- Conversations + messages
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  end_user_ref TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_conversations_agent ON conversations(agent_id);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
```

**Isolation rule:** every repository-layer query for `agents`, `data_sources`, `chunks`, `action_logs`, `conversations` must join up to `client_workspaces.agency_id` and verify it matches the authenticated agency. Implement this as one shared function, e.g. `assertAgentBelongsToAgency(agentId, agencyId)`, called at the top of every route handler that touches agent-scoped data.

---

## 2. REST API Contracts

Base URL: `/api/v1`
Auth: `Authorization: Bearer <JWT>` for dashboard routes. Widget routes use `X-Agent-Key: <agent.api_key>` instead (no agency login).

### Auth
```
POST /auth/signup        { name, email, password } → { token, agency }
POST /auth/login         { email, password } → { token, agency }
```

### Client workspaces
```
GET    /workspaces                     → [ { id, client_name, created_at, agent_count } ]
POST   /workspaces                     { client_name } → { id, client_name }
DELETE /workspaces/:id                 → 204
```

### Agents
```
GET    /workspaces/:workspaceId/agents           → [ { id, template_type, name, status } ]
POST   /workspaces/:workspaceId/agents           { template_type, name } → { id, ...defaults from template }
GET    /agents/:id                               → full agent object incl. config, tools, data_sources
PATCH  /agents/:id                               { llm_provider?, llm_model?, config? } → updated agent
POST   /agents/:id/deploy                        → { api_key } (generates key, sets status: 'live')
```

### Data ingestion
```
POST /agents/:id/data-sources/file      multipart/form-data { file } → { id, status: 'pending' }
POST /agents/:id/data-sources/url       { url } → { id, status: 'pending' }
GET  /agents/:id/data-sources           → [ { id, source_type, source_ref, status } ]
```
Ingestion is async — client polls `status` or receives a webhook/SSE update (SSE optional for v1, polling is fine).

### Tools
```
POST /agents/:id/tools                  { tool_type, tool_config } → { id, tool_type, enabled: true }
PATCH /agents/:id/tools/:toolId         { enabled?, tool_config? } → updated tool
```

### Query (used by widget AND sandbox test in dashboard)
```
POST /agents/:id/query
Headers: X-Agent-Key (widget) or Authorization Bearer (dashboard sandbox test)
Body: { message, conversation_id? }
Response: { reply, conversation_id, actions_taken: [ { tool_type, result } ] }
```

### Action logs
```
GET /agents/:id/action-logs?from=&to=&action_type=   → [ { id, action_type, status, created_at, action_input, action_result } ]
```

---

## 3. Tool Interface Contract

Every connected action tool implements this shape — this is the contract between the LLM Router (which decides to call a tool) and the Tool/Action Service (which executes it). Modeled directly on the MCP tool pattern.

```typescript
interface AgentTool {
  name: string;                    // e.g. "book_calendar_slot"
  description: string;             // shown to the LLM to decide when to call it
  input_schema: JSONSchema;        // parameters the LLM must supply
  execute(input: Record<string, any>, context: ToolContext): Promise<ToolResult>;
}

interface ToolContext {
  agentId: string;
  agentToolConfig: Record<string, any>;  // from agent_tools.tool_config
}

interface ToolResult {
  success: boolean;
  data?: Record<string, any>;
  error?: string;
}
```

**v1 tools to implement:**

**`book_calendar_slot`** (Sales template)
- input_schema: `{ date: string, time: string, attendee_email: string }`
- execute: calls calendar API (recommend Cal.com API or Google Calendar API), returns booking confirmation or error

**`create_support_ticket`** (Support template)
- input_schema: `{ subject: string, description: string, user_email?: string }`
- execute: inserts a row into a `tickets` table (add this table if going beyond a stub) + sends notification email to agency; returns ticket ID

Every `execute()` call, success or failure, must result in one row written to `action_logs` by the Tool/Action Service — not left to the caller to remember.

---

## 4. LLM Router Interface

```typescript
interface LLMRouter {
  complete(params: {
    provider: 'anthropic' | 'openai' | 'bedrock';
    model: string;
    messages: { role: string; content: string }[];
    tools?: AgentTool[];
    systemPrompt: string;
  }): Promise<{
    reply: string;
    toolCalls: { name: string; input: any }[];
  }>;
}
```

One adapter per provider behind this interface. Tool-calling uses each provider's native function-calling API — do not build a custom parsing layer for tool invocation.

---

## 5. RAG Retrieval Logic (Query Service internals)

1. Embed incoming user message (same embedding model used at ingestion time — keep this consistent, mismatched embedding models silently break retrieval quality)
2. `SELECT content FROM chunks WHERE agent_id = $1 ORDER BY embedding <=> $2 LIMIT 5`
3. Build system prompt: template persona + retrieved chunks as context + instruction on when to use tools
4. Call LLM Router with full message history + available tools for this agent
5. If `toolCalls` returned, execute each via Tool/Action Service, feed results back to LLM for final reply
6. Persist message + assistant reply to `messages` table

---

## 6. Ingestion Pipeline Internals

1. File uploaded → stored in S3 at `s3://forma-ai-uploads/{agent_id}/{data_source_id}/{filename}`
2. Text extraction: PDF (pdf-parse or similar), DOCX (mammoth), CSV (papaparse), TXT (raw)
3. URL: fetch HTML, strip tags/nav/footer noise, extract main content text
4. Chunk: ~500 tokens per chunk, ~50 token overlap
5. Embed each chunk (OpenAI `text-embedding-3-small` or Bedrock Titan embeddings — pick one and keep it consistent across the whole system)
6. Insert into `chunks` table with `agent_id`, `data_source_id`
7. Update `data_sources.status = 'processed'` (or `'failed'` with error detail logged)

---

## 7. Non-negotiable Testing Checklist (any agent's work must pass this before merge)

- [ ] Cross-tenant isolation: Agency A cannot fetch/modify Agency B's workspaces, agents, chunks, or logs via any endpoint
- [ ] Ingested file → correct chunk count and retrievable content (manual spot check)
- [ ] Query endpoint returns grounded answers (from the actual uploaded docs, not hallucinated)
- [ ] Tool call → real external action occurs (booking/ticket) → action_log row created with correct status
- [ ] Switching `llm_provider`/`llm_model` on an agent doesn't break the query flow
- [ ] Widget authenticates via `X-Agent-Key` only, cannot access dashboard-only routes
