# Skill: Git Branching, Conventional Commits & Pull Request Automation
**Role:** DevOps & Release Agent  
**Source Inspiration:** `mattpocock/skills` (`/pr` workflow) & `esf`

## Objective
Package verified code, tests, and documentation into clean, review-ready Git branches and GitHub/GitLab Pull Requests with zero manual developer friction.

---

## Operating Protocol

### 1. Branching & Isolation
* Always isolate changes in a dedicated feature/fix branch:
  - Format: `feat/fa-<task-id>-<short-description>`
  - Format: `fix/fa-<ticket-id>-<file-or-bug-slug>`
* Never commit directly to `main` or `production`.

### 2. Conventional Commit Standards
All commits must follow the Conventional Commits 1.0.0 specification:
* `feat(auth): add google oauth2 social login provider`
* `fix(analytics): guard against undefined metrics array in report builder`
* `test(billing): add unit test asserting quota limit enforcement`
* `perf(db): add composite index on workspace_id and created_at`

### 3. Pull Request Synthesis Template
Every PR generated must contain:
```markdown
## Summary of Changes
- Implemented [Feature / Fix name] according to Architect specification.
- Verified zero regressions across the existing test suite.

## Root Cause & Solution (For Fixes)
- **Root Cause:** [Description]
- **Solution:** [Surgical diff explanation]

## Automated Test Evidence
- **Test File:** `src/__tests__/auth.test.ts`
- **Result:** ✅ 14 passed, 0 failed (Executed in isolated sandbox)

## Checklist
- [x] Conforms to OWASP Top 10 security standards
- [x] Includes automated test coverage
- [x] No breaking API contract changes without version bump
```
