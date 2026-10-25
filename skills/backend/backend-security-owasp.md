# Skill: Backend Security & OWASP Top 10 Hardening
**Role:** Backend Developer Agent  
**Source Inspiration:** `addyosmani/agent-skills` (Security Checklist) & OWASP API Security

## Objective
Prevent security vulnerabilities in generated backend code, protecting database records, user authentication, and multi-tenant isolation.

---

## Operating Protocol

### 1. Mandatory Security Checklist
* **SQL Injection Prevention:** 
  - **NEVER** use string interpolation/concatenation in SQL queries (e.g. `query(\`SELECT * FROM users WHERE id = '${id}'\`)` is strictly forbidden).
  - **ALWAYS** use parameterized queries: `query('SELECT * FROM users WHERE id = $1', [id])`.
* **Multi-Tenant Row Isolation:**
  - Every tenant-scoped query must explicitly filter by `workspace_id = $1` or `tenant_id = $1` extracted from the verified session/JWT token—never trust a client-provided `workspace_id` without verifying ownership.
* **Authentication & Passwords:**
  - Hash passwords using `bcrypt` (salt rounds $\ge 12$) or `argon2id`. Never store plaintext or MD5/SHA-1 hashes.
  - Sign JWTs with a strong random secret (`crypto.randomBytes(64)`), specify expiration (e.g. `1h` access token, `7d` refresh token).
* **Cross-Site Scripting (XSS) & Content Security:**
  - Apply `helmet` middleware to set HTTP security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`).
* **Rate Limiting:**
  - Apply `express-rate-limit` to public auth endpoints (login, register, forgot-password) to prevent brute-force attacks (max 5-10 requests/min).
* **Secret Hygiene:**
  - Never hardcode API keys, database passwords, or webhook secrets in source code. Always access via `process.env`.
