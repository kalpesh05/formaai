# Skill: Systematic Root-Cause Debugging
**Role:** QA & Testing Agent  
**Source Inspiration:** `obra/superpowers` (Systematic Debugging) & `affaan-m/ecc`

## Objective
Diagnose and resolve intermittent bugs, memory leaks, and runtime errors by systematically isolating the root cause rather than relying on randomized trial-and-error patching.

---

## Operating Protocol

### 1. The 4-Step Diagnosis Procedure
1. **Reproduce Reliably:** Never attempt to fix a defect that cannot be reproduced either locally, in a test runner, or via an exact mock event payload.
2. **Trace the Data Flow:** 
   - Inspect incoming arguments at the boundary.
   - Inspect intermediate state mutations.
   - Find the exact line where variable state deviates from expected behavior.
3. **Formulate a Hypothesis:** State: *"The bug occurs because `data.items` is undefined when the workspace has zero active members, causing `data.items[0]` to throw a TypeError."*
4. **Targeted Surgical Fix:** Fix the root cause directly at the origin rather than plastering defensive hacks at 5 different downstream call sites.

### 2. Forbidden Anti-Patterns
* **Trial-and-Error Guessing:** Never write patches hoping they work without analyzing the error trace.
* **Silent Error Swallowing:** Never do `catch (e) {}` with no logging or recovery; it hides severe underlying corruption.
* **Over-broad Optional Chaining:** Don't replace an entire architecture with `?.` if an object should logically be present; find out why it was omitted in the first place.
