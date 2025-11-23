Version: 0.1.0  
Last-Updated: YYYY-MM-DD  
Status: Draft / Active / Deprecated

# <BLOCK_NAME> Block Specification
Narrow, reusable implementation block under the `<OwningModule>` module.

This document defines:
- The purpose and narrow responsibility of this block
- Its inputs, outputs, and invariants
- How it interacts with data, storage, and other blocks
- How it must be tested
- How AI agents may safely modify/extend it

---

## 1. Owning Module & Context

1.1 Owning Module  
- Module: `<OwningModule>`  
- Module spec: `specs/modules/<OwningModule>/_MODULE_SPEC.md`

1.2 Block Purpose  
- One short paragraph: what this block does, at a narrow level.

1.3 In-Scope / Out-of-Scope  
- In-scope responsibilities for this block.
- Explicitly out-of-scope concerns (delegated to module or other blocks).

---

## 2. Inputs & Outputs

2.1 Inputs  
- Data structures, events, function parameters this block consumes.
- For each:
  - Name:
  - Type / shape:
  - Source (caller, event bus, DB row, etc.):
  - Preconditions:

2.2 Outputs  
- Data structures, events, return values this block produces.
- Any guarantees about ordering, idempotency, or side effects.

2.3 External Interactions  
- Does this block:
  - Read/write DB via DAL?
  - Touch STORAGE_ROOT via storage helpers?
  - Call external services?
  - Emit events?

All must follow the owning module + core specs; this block does not invent new patterns.

---

## 3. Constraints & Invariants

3.1 Invariants  
List the core truths that must always hold if this block runs correctly.

Examples:
- “Selection set must always refer to existing entity IDs.”
- “This block never deletes files; it only writes to tmp and triggers atomic rename via storage API.”

3.2 Performance Constraints  
- Any performance expectations (e.g., must run within X ms for typical inputs).
- Any limits on input size.

3.3 Concurrency Constraints  
> Align with `_AI_CONCURRENCY_AND_LOCKING_SPEC.md`.

- How this block behaves under concurrent use:
  - Does it require locks?
  - Is it pure/side-effect free?
  - Does it assume single-writer, multi-reader?

---

## 4. Dependencies

4.1 Core Spec Dependencies  
Which core specs constrain this block:

- `_AI_STORAGE_ARCHITECTURE.md` (if it touches storage)
- `_AI_DB_AND_DATA_MODELS_SPEC.md` (if it touches DB)
- `_AI_AUTH_AND_IDENTITY_SPEC.md` / `_AI_ROLES_AND_PERMISSIONS.md` (if auth/roles aware)
- `_AI_UI_SYSTEM_SPEC.md` (if it drives UI behavior)
- `_AI_FILE_AND_IMAGE_PIPELINE_SPEC.md` (if image-related)
- etc.

4.2 Module Dependencies  
- The owning module (from Section 1).
- Any other modules whose services/APIs this block uses.

4.3 Other Blocks  
- Other blocks this block calls or composes.
- Direction of dependency must be clear (to avoid cycles).

---

## 5. Error Handling & Logging

> Align with `_AI_ERROR_HANDLING_AND_DIAGNOSTICS_SPEC.md`.

5.1 Error Types  
- Expected error categories (validation, permission, transient IO, etc.).
- For each:
  - When it can happen.
  - How the block should surface it to its caller.

5.2 Logging Rules  
- What events/conditions must be logged.
- What MUST NOT be logged (PII, secrets, large payloads).

5.3 Retry & Idempotency  
- Can this block be retried on failure?
- Is it idempotent for the same input?

---

## 6. Testing Requirements

> Align with `_AI_TESTING_AND_VERIFICATION_SPEC.md`.

6.1 Unit Tests  
- What aspects of this block must be covered.
- Edge cases and invariants to assert.

6.2 Integration / Contract Tests  
- If the block talks to DB/storage, what must be integration-tested.
- Any contract tests with other blocks or modules.

6.3 Non-Functional Tests  
- Performance tests (if relevant).
- Stress/concurrency tests (if relevant).

---

## 7. AI Usage Notes

7.1 Required Context for AI  
Before an AI agent edits this block or its spec, it MUST load:

- `_AI_MASTER_RULES.md`
- `_AI_CONTEXT_MAP.md`
- The owning module spec: `specs/modules/<OwningModule>/_MODULE_SPEC.md`
- This block spec
- Relevant core specs from Section 4.1

7.2 Allowed Transformations  
AI may:

- Refactor internal implementation while preserving public behavior defined here.
- Improve performance without changing observable behavior.
- Add tests to better cover invariants.
- Fix clearly-defined bugs that violate invariants.

7.3 Forbidden Actions / STOP Rules  
AI MUST STOP and ask a human if:

- A change would alter the block’s externally visible behavior.
- A change would touch DB schema, STORAGE_ROOT layout, or permission model.
- Requirements conflict with owning module spec or core specs.
- The block appears to be doing work that conflicts with the “Out-of-Scope” list.

---

## 8. Open Questions / TODOs

- [ ] Question / ambiguity 1
- [ ] Question / ambiguity 2

End of `<BLOCK_NAME>` block specification.
