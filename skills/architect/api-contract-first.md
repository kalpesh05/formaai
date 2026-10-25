# Skill: API Contract-First Synchronization
**Role:** System Architect Agent  
**Source Inspiration:** `addyosmani/agent-skills` (API Design) & OpenAPI 3.1 Standards

## Objective
Act as the authoritative bridge between the Frontend Developer Agent and Backend Developer Agent by defining strict API contracts (OpenAPI / Zod TypeScript schemas) *before* either agent begins writing code.

---

## Operating Protocol

### 1. The Zero-Mismatch Rule
* Frontend and Backend agents must **never** infer request payloads or response shapes independently.
* The Architect creates the single source of truth:
  - TypeScript types / Zod schemas (`shared/types.ts` or `src/types/api.ts`)
  - Endpoint path, HTTP verb, expected URL query parameters
  - Request body schema with required/optional field annotations
  - 200/201 success response schema
  - 400/401/403/404/500 error envelope schema

### 2. Standard Universal Response Envelope
All API endpoints must follow this consistent envelope:
```typescript
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;       // e.g. "VALIDATION_FAILED", "UNAUTHORIZED"
    message: string;    // Human-readable message
    details?: any;      // Validation issues or field errors
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    timestamp: string;  // ISO 8601
  };
}
```

### 3. Execution Sequence
1. Architect produces the API specification and schemas.
2. Frontend Agent writes UI components and binds to mocked handlers matching the schema.
3. Backend Agent implements the Express router, controller, and database queries validating against the schema.
4. QA Agent runs tests to verify real backend responses strictly match the contract schema.
