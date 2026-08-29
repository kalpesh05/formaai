# Forma AI — Detailed Explanation

## 1. The problem
Agencies and freelancers rebuild similar RAG/chatbot infrastructure for every client. Existing tools (Chatbase, Botpress, Voiceflow) are built for a single business managing one bot — not for an agency managing many clients' agents from one place. None of them are action-first: most are Q&A tools with actions bolted on.

## 2. Who uses this
- **Agency admin** — signs up, creates client workspaces, configures agents per client, views action logs, sets white-label branding
- **Client's end users** — interact with the deployed widget/API, never see the Forma AI dashboard
- (Later phases) Direct SMB self-serve users, mid-size B2B teams

## 3. Core user flow (v1)
1. Agency signs up, logs into dashboard
2. Agency creates a **client workspace** (e.g., "Client: Joe's Plumbing")
3. Agency picks a **template** (Support or Sales) for that client
4. Agency uploads the client's docs / pastes a website URL → system ingests and embeds it
5. Agency connects the action tool for that template (ticket system for Support, calendar for Sales)
6. Agency tests the agent in a sandbox chat
7. Agency deploys — gets a widget embed snippet + API key
8. Client's end users chat with the widget; agent answers from the docs and, when relevant, performs the connected action (creates a ticket, books a slot)
9. Every action taken is recorded in the **action log**, visible to the agency (and exportable to show the client)

## 4. The two v1 templates, in detail

### Support agent
- **Q&A**: answers from uploaded help docs/FAQs
- **Action**: creates a support ticket when it can't resolve a query, or when the user explicitly asks to escalate
- **Trigger logic**: LLM decides via tool-calling whether the user's message needs an answer, a ticket, or both

### Sales agent
- **Q&A**: answers product/pricing questions from uploaded docs
- **Action**: books a calendar slot when a user wants a demo/call
- **Trigger logic**: same tool-calling pattern — LLM decides when to invoke the booking tool vs just answering

Both templates share the same underlying RAG + tool-calling engine — only the prompt persona, default tool, and default data-source instructions differ. This is important: **build one engine, not two separate agents.**

## 5. Why the action log matters (not just a feature, a trust mechanic)
Agencies need to prove value to their own clients. "Here's what your AI agent did this week — 12 tickets created, 5 demos booked" is a concrete report an agency can hand to their client. This is the seed of the governance/audit-trail differentiator borrowed conceptually from how larger orchestration platforms (e.g., Prinevo, in the dev-tooling space) track agent actions for accountability — scaled down here to something an agency can screenshot and send in an email.

## 6. Multi-tenancy — the non-negotiable constraint
Every table, every query, every API route must respect: **Agency → Client Workspace → Agent** as a strict hierarchy. An agency must never be able to see, query, or accidentally leak another agency's data. This is treated as a security requirement, not just a data-modeling preference — see the testing checklist in `03-LOW-LEVEL-ARCHITECTURE.md`.

## 7. LLM & tool-calling approach
- Multi-provider from day one (Anthropic, OpenAI, Bedrock) via a router abstraction — agencies/clients aren't locked to one model
- Tool-calling uses the LLM provider's **native function-calling mechanism** — do not build a custom agent-loop/ReAct framework for v1. The model decides when to call a tool; the backend executes it; result goes back to the model; model responds to the user.

## 8. What's deliberately NOT in v1 (and why)
| Excluded | Why |
|---|---|
| Drag-drop visual builder | Form wizard is faster to build and sufficient for 2 templates |
| Slack/WhatsApp/Notion/Drive connectors | Adds surface area before core loop is proven |
| Custom prompt IDE | Power-user feature, not needed to validate the core wedge |
| Memory layer (Mem0 etc.) | Neither v1 template needs cross-session memory; add in Phase 2 for Personal Assistant template |
| Analytics dashboard | Action log list is sufficient signal for v1 |
| Sub-user roles within an agency | Single agency-owner login is enough to validate the model |

## 9. Success criteria for v1
- 3–5 agencies each running 2+ client workspaces
- At least one real action (not just Q&A) logged per live agent
- New client workspace goes from creation to live agent in under 15 minutes, unassisted
