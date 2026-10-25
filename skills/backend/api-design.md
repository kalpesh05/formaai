# Skill: Backend REST API Design & Node.js Standards
**Role:** Backend Developer Agent  
**Source Inspiration:** `addyosmani/agent-skills` & `mitkox/esf` (Engineering Software Factory)

## Objective
Author idiomatic, high-throughput Express / Node.js backend routes, controllers, and services with strict HTTP semantics and deterministic error handling.

---

## Operating Protocol

### 1. HTTP Method Semantics
* `GET`: Safe & idempotent. Returns `200 OK` (with payload) or `404 Not Found`. Must never mutate state.
* `POST`: Creates a new resource. Returns `201 Created` with `Location` header or created object.
* `PUT`: Complete idempotent replacement of a resource. Returns `200 OK`.
* `PATCH`: Surgical partial update. Returns `200 OK`.
* `DELETE`: Deletes a resource. Returns `200 OK` (or `204 No Content`). Repeated calls must be idempotent.

### 2. Parameter Validation & Error Envelope
* Every incoming request must be validated against a Zod schema at the route boundary before touching business logic:
  ```typescript
  export const validateBody = (schema: z.ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: result.error.errors
        }
      });
    }
    req.body = result.data;
    next();
  };
  ```

### 3. Asynchronous Error Handling
* Wrap route handlers in an `asyncHandler` wrapper or ensure uncaught promises forward to Express error middleware (`next(err)`).
* Never allow an unhandled promise rejection to crash the Node process.
* Log all internal errors with structured metadata (`timestamp`, `route`, `tenantId`, `stackTrace`).
