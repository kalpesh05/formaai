# Forma AI — Documentation Overview

**Read this file first.** It orients any developer or AI agent before they open a module-specific doc.

## What we're building
Forma AI is a multi-tenant platform where **agencies** manage **multiple client workspaces**, each with its own AI agent that (a) answers questions from the client's own data (RAG) and (b) takes real actions (booking, ticket creation) through connected tools — not just chat.

## Why it's different from Chatbase/Botpress/Voiceflow
Those platforms are single-tenant, Q&A-first chatbot builders. Forma AI is agency-first (one dashboard, many isolated client agents) and action-first (every template does something, not just answers). Full competitive reasoning: see `01-DETAILED-EXPLANATION.md`.

## Document set
| File | Purpose | Best for |
|---|---|---|
| `00-OVERVIEW.md` | This file — orientation | Everyone, read first |
| `01-DETAILED-EXPLANATION.md` | Product logic, user flows, why each feature exists | Product-minded agents, anyone unsure *why* before *how* |
| `02-HIGH-LEVEL-ARCHITECTURE.md` | System diagram, services, data flow, tech stack | Anyone starting fresh, or coordinating between modules |
| `03-LOW-LEVEL-ARCHITECTURE.md` | DB schema, API contracts, module internals | The agent actually writing code for a specific module |
| `04-AGENT-TASK-ASSIGNMENTS.md` | Module-by-module task breakdown, one section per agent | Use this to literally copy-paste a task to an individual agent |

## v1 Scope (do not exceed without checking with product owner)
- 2 templates: **Support agent**, **Sales agent**
- Multi-tenant: Agency → Client Workspaces → Agents
- RAG (file/URL ingestion) + 1 connected action per template (ticket creation, calendar booking)
- Per-client action log (audit trail)
- White-labeled embeddable widget
- Explicitly excluded from v1: drag-drop builder, Slack/WhatsApp/Notion/Drive connectors, custom prompt IDE, memory layer, analytics dashboard, sub-user roles

## How to assign work
Each numbered module in `04-AGENT-TASK-ASSIGNMENTS.md` is designed to be handed to one agent/developer with minimal cross-talk needed, as long as everyone builds against the shared schema and API contracts in `03-LOW-LEVEL-ARCHITECTURE.md`. That file is the source of truth all agents must agree on before writing code — changes to it should be flagged to whoever owns integration.
