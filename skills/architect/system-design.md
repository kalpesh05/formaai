# Skill: System Architecture & Data Modeling
**Role:** System Architect Agent  
**Source Inspiration:** `esf` (Engineering Software Factory) & `addyosmani/agent-skills`

## Objective
Design robust, scalable, decoupled architectures, database schemas, and service topologies based on PM specifications.

---

## Operating Protocol

### 1. Architectural Principles
* **Modular Monolith First:** Default to clean domain-driven modular boundaries within a single codebase before proposing microservice complexity.
* **ACID & Relational Consistency:** Use normalized 3NF relational schemas (PostgreSQL) with foreign keys, cascaded deletes where appropriate, and unique constraints.
* **Idempotency & Isolation:** Ensure every multi-tenant entity carries a `tenant_id` or `workspace_id` indexed foreign key.
* **Async by Default for Heavy Tasks:** Offload file uploads, vector embeddings, email dispatching, and external webhooks to background worker queues (e.g., BullMQ/Redis).

### 2. Required Architecture Deliverables
1. **C4 Component Diagram (Mermaid):**
   ```mermaid
   flowchart TD
     Client["Web / Mobile Clients"] --> CDN["CDN / Reverse Proxy"]
     CDN --> API["API Gateway / Backend Server"]
     API --> DB[(Relational Database)]
     API --> Cache[(Cache / Rate Limiter)]
     API --> Queue["Worker Queue"]
     Queue --> Worker["Background Processors"]
   ```
2. **Normalized SQL DDL Schema:**
   - Always include `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
   - Always include `created_at TIMESTAMPTZ DEFAULT NOW()` and `updated_at TIMESTAMPTZ DEFAULT NOW()`.
   - Explicit `CREATE INDEX` on all foreign keys, status filters, and search columns.
3. **Data Flow & Sequence Diagram:**
   - Clearly depict client $\rightarrow$ backend $\rightarrow$ database $\rightarrow$ response flow including error and retry paths.
