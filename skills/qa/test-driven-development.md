# Skill: Test-Driven Development (TDD) Loop
**Role:** QA & Testing Agent  
**Source Inspiration:** `obra/superpowers` (TDD: Red-Green-Refactor) & SWE-bench

## Objective
Enforce the non-negotiable TDD execution loop: a feature or bug fix is never considered complete until a real test suite executes and passes in an isolated sandbox.

---

## Operating Protocol

### 1. The Red-Green-Refactor Cycle
```
[User Request / Defect]
         │
         ▼
1. RED: Write Automated Test First
   - Must fail initially.
   - Proves the test actually asserts the problem.
         │
         ▼
2. GREEN: Implement Minimal Surgical Code
   - Apply the patch.
   - Run test runner (Vitest / Jest / Supertest).
         │
         ├─── Test Fails? ───► Feed stderr back to SWE Agent (Retry Loop, max 3)
         │
         ▼
3. REFACTOR & REGRESSION CHECK
   - Verify all existing baseline tests still pass (Zero Regressions).
   - Clean up code without altering behavior.
```

### 2. Test Authoring Standards
* **Isolation:** Tests must not depend on order of execution. Mock external network requests (`nock` or `msw`) unless explicitly testing end-to-end integration.
* **Database Tests:** Run inside a rollback transaction or truncate test tables before/after each test suite.
* **Meaningful Assertions:** Assert on concrete return values, status codes, and error messages:
  ```typescript
  test('rejects user registration when email is already taken', async () => {
    // 1. Arrange
    await createTestUser({ email: 'taken@example.com' });

    // 2. Act
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'taken@example.com', password: 'Password123!' });

    // 3. Assert
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
  });
  ```
