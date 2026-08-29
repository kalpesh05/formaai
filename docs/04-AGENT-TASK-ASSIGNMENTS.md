# Forma AI — Agent Task Assignments

Each section below is written to be copy-pasted directly to one individual developer or AI coding agent (e.g., a separate Claude Code session). All agents must build against the shared contracts in `03-LOW-LEVEL-ARCHITECTURE.md` — do not deviate from the schema or API shapes without flagging it to whoever owns integration.

Suggested build order: **Agent 1 → Agent 2 → (Agent 3, 4, 5 can run in parallel) → Agent 6 → Agent 7**

---

## Agent 1 — Foundation & Auth
**Reads:** `02-HIGH-LEVEL-ARCHITECTURE.md`, `03-LOW-LEVEL-ARCHITECTURE.md` (sections 1, 2 — Auth routes)

**Build:**
- Project scaffolding: `/backend` (Node.js + Fastify/Express), Docker Compose for local Postgres
- Run the full schema from `03-LOW-LEVEL-ARCHITECTURE.md` section 1
- Auth service: signup, login, JWT issuance
- Client workspace CRUD, scoped to authenticated agency
- Shared middleware: `assertAgentBelongsToAgency()` and equivalent checks for workspace/data-source ownership — this must be reusable by every other agent's routes

**Done when:** two test agencies can sign up, each create client workspaces, and it's provably impossible for one to query the other's data via API.

---

## Agent 2 — Agent/Template Config Service
**Reads:** `03-LOW-LEVEL-ARCHITECTURE.md` (sections 1, 2 — Agents routes), `01-DETAILED-EXPLANATION.md` (section 4 — template details)

**Build:**
- Two template presets (Support, Sales) as seed data — default `config` JSONB per template
- `POST /workspaces/:workspaceId/agents` — create agent from template
- `GET /agents/:id`, `PATCH /agents/:id`
- `POST /agents/:id/deploy` — generates `api_key`, sets status to `live`

**Done when:** an agent can be created under a client workspace from either template, configured, and deployed to get a working `api_key`.

---

## Agent 3 — Ingestion Pipeline
**Reads:** `03-LOW-LEVEL-ARCHITECTURE.md` (section 6 — Ingestion internals), section 2 (Data ingestion API)

**Build:**
- File upload → S3 storage
- Text extraction: PDF, DOCX, CSV, TXT
- URL scrape → text extraction
- Chunking (~500 tokens, ~50 overlap)
- Embedding generation (pick one embedding model, document the choice) → insert into `chunks`
- Update `data_sources.status` accordingly

**Done when:** uploading a real PDF or pasting a URL results in correctly chunked, embedded, retrievable content in the `chunks` table.

---

## Agent 4 — RAG Query Service + LLM Router
**Reads:** `03-LOW-LEVEL-ARCHITECTURE.md` (sections 4, 5 — LLM Router interface, RAG retrieval logic)

**Build:**
- `LLMRouter` interface with adapters for Anthropic, OpenAI, Bedrock
- `POST /agents/:id/query` — embed message, retrieve top-k chunks, build prompt, call router
- Persist `conversations` and `messages`
- Support both dashboard sandbox auth (JWT) and widget auth (`X-Agent-Key`) on this route

**Done when:** a query against an agent with ingested docs returns a grounded answer, and switching `llm_provider` on the agent changes which provider is called without other code changes.

---

## Agent 5 — Tool/Action Service
**Reads:** `03-LOW-LEVEL-ARCHITECTURE.md` (section 3 — Tool Interface Contract), `01-DETAILED-EXPLANATION.md` (section 4 — template action logic)

**Build:**
- `AgentTool` interface implementation pattern
- `book_calendar_slot` tool (Sales) — real integration with Cal.com or Google Calendar API
- `create_support_ticket` tool (Support) — ticket row + notification email
- Wire tool availability into the LLM Router's function-calling call (tools passed based on `agent_tools` table, filtered by `enabled`)
- Every execution (success or failure) writes to `action_logs`

**Done when:** asking the Sales agent to book a demo results in a real calendar booking and a corresponding `action_logs` row; same for Support agent ticket creation.

---

## Agent 6 — Agency Dashboard (Frontend)
**Reads:** `02-HIGH-LEVEL-ARCHITECTURE.md`, all API contracts in `03-LOW-LEVEL-ARCHITECTURE.md` section 2, `01-DETAILED-EXPLANATION.md` (full user flow, section 3)

**Build:**
- React + TypeScript app
- Login/signup screens
- Client workspace list + create/delete
- Agent config wizard: template select → data upload → tool connect → sandbox test → deploy
- Action log viewer (list, filter by date/type) per agent
- White-label settings screen (logo/name)

**Done when:** an agency user can complete the full flow (signup → client workspace → configured, deployed agent → view action logs) without touching the API directly.

---

## Agent 7 — Embeddable Widget
**Reads:** `03-LOW-LEVEL-ARCHITECTURE.md` (Query API contract), `02-HIGH-LEVEL-ARCHITECTURE.md` (section 3)

**Build:**
- Lightweight vanilla JS chat widget (no heavy framework — keep bundle small)
- Authenticates via `X-Agent-Key`
- Applies white-label branding (logo/name) fetched from agent config
- Distributable as a `<script>` snippet the agency pastes into their client's website

**Done when:** the widget can be embedded on a plain HTML test page, chat with a live agent, and correctly display white-label branding.

---

## Integration owner checklist (whoever coordinates all agents)
- [ ] All agents built against the exact schema in `03-LOW-LEVEL-ARCHITECTURE.md` — no silent schema changes
- [ ] Full end-to-end test: signup → workspace → agent → ingest → deploy → widget chat → action taken → log visible in dashboard
- [ ] Cross-tenant isolation test run against the finished system, not just Agent 1's module in isolation
