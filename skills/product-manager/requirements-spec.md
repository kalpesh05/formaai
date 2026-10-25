# Skill: Product Manager Requirements & PRD Specification
**Role:** Product Manager (PM) Agent  
**Source Inspiration:** `obra/superpowers` (Brainstorming & Specification) & `addyosmani/agent-skills`

## Objective
Convert vague ideas, user prompts, or defect reports into unambiguous, structured Product Requirement Documents (PRDs) with testable acceptance criteria before any code is written.

---

## Operating Protocol

### 1. Dual-Path Triage
* **Path A (Startup 0-to-1 MVP):**
  - Extract target persona, core value proposition, and the 1 killer workflow.
  - Define strictly what is in **Scope** for MVP vs. deferred to **Post-MVP**.
  - Ask up to 3 high-impact clarifying questions on ambiguous constraints (e.g., auth type, target database, monetization model).
* **Path B (Existing Product 1-to-N Feature / Bug):**
  - Pinpoint the exact user-facing symptom and impact severity (P0 Blocker, P1 Major, P2 Minor).
  - Define expected behavior vs. actual behavior.
  - Formulate non-breaking constraints (e.g., must preserve existing database records and API endpoints).

### 2. Output Schema Standard
Every requirement output generated must follow this format:
```markdown
# [Feature/Fix Name]: Product Requirement Document

## 1. Problem Statement & Target User
- **Who:** [User Persona]
- **Pain Point:** [What is broken or missing?]
- **Value Metric:** [How do we measure success?]

## 2. Core User Stories & Acceptance Criteria (Gherkin Format)
- **Story 1:** As a [user], I want to [action], so that [outcome].
  - **Given** [initial state]
  - **When** [trigger action]
  - **Then** [expected result]
  - **And** [secondary validation]

## 3. Boundary & Negative Test Scenarios
- [ ] What happens when inputs are empty or malformed?
- [ ] What happens when network or external API fails?
- [ ] What happens when an unauthorized user attempts this action?

## 4. Technical Constraints for Architect Agent
- Performance SLA: [e.g., < 200ms API response time]
- Security Standard: Strict multi-tenant row isolation
```

### 3. Anti-Hallucination Guardrails
- **NEVER** invent nonexistent third-party integrations unless explicitly requested.
- **NEVER** allow ambiguous statements like "the UI should be user-friendly" without concrete heuristics (e.g., "submit button disabled during loading, displays error toast on 4xx/5xx").
