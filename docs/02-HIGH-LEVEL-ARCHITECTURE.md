# Forma AI — High-Level Architecture

## 1. System diagram

```
┌──────────────────────────────────────────────────────────────┐
│                         CLIENTS                                │
│  Agency Dashboard (React/TS)    Embeddable Widget (vanilla JS) │
└───────────────┬──────────────────────────┬─────────────────────┘
                 │         REST API (JSON, JWT auth)              │
┌────────────────┴──────────────────────────┴─────────────────────┐
│                        BACKEND (Node.js)                          │
│                                                                    │
│  ┌───────────┐  ┌────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │   Auth    │  │   Config    │  │  Ingestion   │  │  RAG Query  │ │
│  │  Service  │  │   Service   │  │   Service    │  │  Service    │ │
│  └───────────┘  └────────────┘  └──────────────┘  └────────────┘ │
│  ┌───────────┐  ┌────────────┐  ┌──────────────┐                 │
│  │   Tool/    │  │  LLM Router │  │  Action Log  │                 │
│  │   Action   │  │ (multi-     │  │   Service    │                 │
│  │  Service   │  │  provider)  │  │              │                 │
│  └───────────┘  └────────────┘  └──────────────┘                 │
└──────────┬─────────────────┬──────────────────┬────────────────────┘
           │                 │                  │
┌──────────┴──────┐ ┌────────┴────────┐ ┌───────┴────────────┐
│   PostgreSQL     │ │   S3            │ │  External APIs      │
│  (core data +    │ │  (uploaded      │ │  - Anthropic         │
│   pgvector for   │ │   files)        │ │  - OpenAI             │
│   embeddings)    │ │                 │ │  - AWS Bedrock        │
│                   │ │                 │ │  - Calendar API       │
│                   │ │                 │ │  - (email for tickets)│
└───────────────────┘ └─────────────────┘ └───────────────────────┘
```

## 2. Services and their responsibility (one per "agent" if splitting build work)

| Service | Responsibility | Depends on |
|---|---|---|
| **Auth Service** | Agency signup/login, JWT issuance, client-workspace-scoped access checks | Postgres |
| **Config Service** | CRUD for client workspaces, agents, templates, tool configs | Postgres |
| **Ingestion Service** | File upload handling, text extraction, chunking, embedding generation, storage | S3, Postgres+pgvector, embedding API |
| **RAG Query Service** | Given a user message: embed → retrieve chunks → build prompt → call LLM Router | Postgres+pgvector, LLM Router |
| **Tool/Action Service** | Defines and executes connected tools (calendar booking, ticket creation); called via LLM function-calling | External APIs (calendar, email), Postgres (action_logs) |
| **LLM Router** | Abstracts Anthropic/OpenAI/Bedrock behind one interface; picks provider/model per agent config | External LLM APIs |
| **Action Log Service** | Records every tool execution; exposes list/filter API for dashboard | Postgres |

## 3. Frontend surfaces

| Surface | Tech | Purpose |
|---|---|---|
| **Agency Dashboard** | React + TypeScript | Client workspace list, agent config wizard, action log viewer, white-label settings |
| **Embeddable Widget** | Vanilla JS (lightweight, no framework) | Chat UI embedded on the client's own website, calls RAG Query + Tool services |

## 4. Data flow — one full request example (Sales agent, booking request)

1. End user types "Can I book a demo?" into the widget
2. Widget → `POST /api/agents/:id/query` with message + conversation_id
3. RAG Query Service embeds the message, retrieves relevant chunks (product info) for context
4. Prompt sent to LLM Router → provider decides (via function-calling) that this needs the `calendar_booking` tool
5. Tool/Action Service executes the booking against the calendar API
6. Result returned to LLM → LLM composes final reply to user
7. Action Log Service writes a row: `{agent_id, action_type: 'calendar_booking', input, result, status}`
8. Response returned to widget; user sees confirmation

## 5. Tech stack summary

| Layer | Choice |
|---|---|
| Frontend | React + TypeScript |
| Widget | Vanilla JS, framework-free build |
| Backend | Node.js (Fastify or Express) |
| Database | PostgreSQL (+ pgvector extension) |
| File storage | AWS S3 |
| LLM providers | Anthropic, OpenAI, AWS Bedrock (via router) |
| Infra | AWS ECS, RDS, Docker, GitHub Actions CI |
| Auth | JWT, agency-scoped |

## 6. Cross-cutting concerns (apply to every service)

- **Tenant isolation**: every DB query scoped through `agency_id` → `client_workspace_id` → `agent_id`. No exceptions.
- **Error handling**: all external API calls (LLM, calendar, email) wrapped with retries + graceful failure that still logs to `action_logs` with `status: 'failed'`
- **Observability**: structured logging per request with `agency_id`/`agent_id` tags, minimum viable for v1 (no need for a full observability stack yet)

## 7. What connects to what (for agents building in parallel)

If different agents are building different services, the **contract points** they must agree on upfront are in `03-LOW-LEVEL-ARCHITECTURE.md`:
- DB schema (shared, don't diverge)
- REST API request/response shapes between frontend ↔ backend
- Tool interface contract (`{name, description, input_schema, execute()}`) between LLM Router and Tool/Action Service
