# Skill: Safe Database Migrations & Query Optimization
**Role:** Backend Developer Agent  
**Source Inspiration:** `esf` (Engineering Software Factory) & Production DBA Standards

## Objective
Author safe, non-blocking, zero-downtime database migrations (PostgreSQL) and write query patterns that prevent memory leaks and connection starvation.

---

## Operating Protocol

### 1. Zero-Downtime Migration Rules
* **Never Drop Columns Directly:** Use the Expand/Contract pattern:
  1. Add the new column (nullable or with default).
  2. Deploy application code that reads/writes both columns.
  3. Backfill old records in batches.
  4. Deprecate and drop the old column in a subsequent release.
* **Adding NOT NULL Columns:** Always provide a `DEFAULT` value when adding a `NOT NULL` column to an existing table to prevent table-level lockups.
* **Concurrent Index Creation:** For large production tables, create indexes using `CREATE INDEX CONCURRENTLY` so write operations are not blocked.

### 2. N+1 Query Elimination
* Never execute database queries inside loops (`for (const item of items) { await query(...) }`).
* Use SQL `JOIN`, `WHERE id = ANY($1)`, or a DataLoader batching pattern to fetch related entities in a single query.

### 3. Connection Pool Discipline
* Always release pooled connections back to the pool (`client.release()`) inside a `finally` block when using manual transactions:
  ```typescript
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // ... operations ...
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  ```
