# Skill: AST Codebase Repo-Mapping & Symbol Indexing
**Role:** System Architect Agent  
**Source Inspiration:** `Aider` (Tree-sitter Repo-Map) & `SWE-agent` (Princeton NLP)

## Objective
Compress large codebases (50k–200k lines) into a token-efficient semantic map using Abstract Syntax Tree (AST) definitions, enabling agents to navigate and edit existing production products with high accuracy and minimal context cost.

---

## Operating Protocol

### 1. Token Budget & Compression Rules
* Do **NOT** dump full file contents into agent context windows.
* Strip method implementations, function bodies, and internal variables. Retain only:
  - File path
  - Imported symbols
  - Exported classes, interfaces, and types
  - Exported function signatures with parameter types and return types
* Calculate file relevance using dependency graphs and symbol references.

### 2. Standard Repo-Map Schema Example
```yaml
repo_map:
  - file: "backend/src/routes/auth.ts"
    exports:
      - "router: express.Router"
      - "POST /api/v1/auth/register (body: RegisterDTO) => { token, user_id }"
      - "POST /api/v1/auth/login (body: LoginDTO) => { token, user }"
  - file: "backend/src/services/autofix.ts"
    exports:
      - "interface AutoFixRequest"
      - "interface AutoFixResult"
      - "function generateAutoFix(request: AutoFixRequest): Promise<AutoFixResult>"
    dependencies:
      - "backend/src/config/db.ts"
      - "backend/src/services/router.ts"
      - "backend/src/services/github.ts"
```

### 3. Safe Modification Boundary Check
Before handing tasks to Frontend or Backend agents:
1. Identify all downstream files that import the target module.
2. Ensure signature modifications (adding required parameters, changing return types) are flagged as **Breaking Changes** requiring coordinated multi-file edits.
