# Version: SPEC_V1.0  
Last-Updated: 2025-11-23  
Status: Draft / Active / Deprecated

# <MODULE_NAME> Module Specification
Authoritative behavior spec for the `<MODULE_NAME>` module.

This document defines:
- The responsibilities and boundaries of this module
- Its public APIs and events
- Its data/storage model
- Its permissions and security model
- How it integrates with core systems and other modules
- Testing and verification requirements
- AI usage and STOP rules for this module

---

## 1. Purpose & Scope

1.1 Purpose  
- What this module is for in one or two paragraphs.  
- What main user / system problems it solves.

1.2 In-Scope  
- Bullet list of responsibilities this module **does** own.

1.3 Out-of-Scope  
- Bullet list of things this module **explicitly does NOT** own (other modules do).

---

## 2. Core Responsibilities & Flows

2.1 Primary Responsibilities  
- Short list of key responsibilities (e.g., “project lifecycle”, “map management”, “sketch tools”).

2.2 Key User Flows  
Describe the main flows the module supports (high level):

- Flow A: <name>
  - Trigger:
  - Preconditions:
  - Steps:
  - Postconditions / guarantees:

- Flow B: <name>
  - ...

---

## 3. Public APIs

3.1 HTTP / REST APIs  
List each public HTTP endpoint owned by this module.

- **Method / Path:** `GET /api/...`
  - Purpose:
  - Auth requirements (which roles / permissions):
  - Request fields:
  - Response shape:
  - Error cases (with error codes/structures):

3.2 WebSocket / Streaming APIs (if any)  
- Channel / topic:
- Message types:
- Auth model:
- Backpressure / rate limits:

3.3 Internal Service APIs  
- Functions or service calls exposed to other modules (e.g. via internal RPC/event bus).
- Document signatures, inputs/outputs, and invariants.

---

## 4. Data & Storage

> This section MUST follow `_AI_STORAGE_ARCHITECTURE.md` and `_AI_DB_AND_DATA_MODELS_SPEC.md`.

4.1 Databases  
For each DB table this module owns or uses:

- **Table:** `<schema>.<table_name>`
  - Owner: this module / shared / other module
  - Purpose:
  - Key columns:
    - `id` (PK, type)
    - Foreign keys (and referenced tables)
    - Important indexed columns
  - Soft-delete rules:
  - Invariants (e.g., “rows must always have project_id not null”)

Blocks within this module may read/write these tables only via module-defined services or repositories. This module spec is the single source of truth for table schemas; blocks and helpers must not define new tables or columns on their own.

4.2 Files & Directories under STORAGE_ROOT  
- Paths under `STORAGE_ROOT/projects/<projectUUID>/...` or others this module uses.
- Who owns these paths (this module vs shared).
- Rules for naming and lifecycle (creation, modification, deletion).
- How atomic write and manifest rules apply (link to `_AI_STORAGE_ARCHITECTURE.md`).

Blocks within this module may access these paths only through module-defined storage helpers/services. This module spec owns the definition of directory structure and naming rules under STORAGE_ROOT; blocks and helpers must not define new STORAGE_ROOT directories or naming schemes independently.

4.3 External Systems (if any)  
- External DBs, caches, or services this module talks to.
- Connection rules, timeouts, retry policies.

---

## 5. Roles, Permissions & Security

> MUST align with `_AI_AUTH_AND_IDENTITY_SPEC.md`, `_AI_ROLES_AND_PERMISSIONS.md`, and `_AI_SECURITY_AND_COMPLIANCE_SPEC.md`.

5.1 Permissions Used / Required  
List concrete permissions from the global permission model this module needs:

- `project.read`
- `map.create`
- `module.configure`
- etc.

5.2 Role Behavior  
For core roles (SysAdmin, ProjectOwner, ProjectAdmin, Custom roles):

- What each role can do in this module.
- Any module-specific overrides or nuances.

5.3 Security Constraints  
- Data that is considered sensitive and how it must be accessed.
- Encryption requirements (at-rest, in-transit).
- Logging restrictions (no PII, no secrets, etc.).

---

## 6. Dependencies

6.1 Core Spec Dependencies  
This module is constrained by:

- `_AI_STORAGE_ARCHITECTURE.md`
- `_AI_DB_AND_DATA_MODELS_SPEC.md`
- `_AI_AUTH_AND_IDENTITY_SPEC.md`
- `_AI_ROLES_AND_PERMISSIONS.md`
- `_AI_TEMPLATES_AND_DEFAULTS.md`
- `_AI_UI_SYSTEM_SPEC.md`
- `_AI_SECURITY_AND_COMPLIANCE_SPEC.md`
- (Add/remove as appropriate)

6.2 Module Dependencies  
Modules this module depends on:

- `<OtherModule>` – what it uses from it and why.
- Any constraints to avoid circular dependencies.

- Shared libraries from `specs/libs` that this module uses (if any). Helpers that are only used within this module are treated as local implementation details and do not need their own specs.

6.3 Block Dependencies  
Blocks (from `specs/blocks`) this module uses heavily.

---

## 7. Error Handling & Observability

> Align with `_AI_ERROR_HANDLING_AND_DIAGNOSTICS_SPEC.md` and `_AI_MONITORING_AND_ALERTING_SPEC.md`.

7.1 Error Model  
- Error categories (validation, permission, transient, fatal).
- How errors should be surfaced to callers (error codes / structures).

7.2 Logging  
- What must be logged for major operations.
- Which sensitive values must never be logged.

7.3 Metrics & Alerts  
- Key metrics this module must emit (e.g. operation latency, failure counts).
- Alert thresholds and who “owns” responding.

---

## 8. Templates, Defaults & Configuration

> Align with `_AI_TEMPLATES_AND_DEFAULTS.md` and `_AI_USER_PREFERENCES_AND_PERSONALIZATION_SPEC.md` (if relevant).

8.1 Factory Templates  
- Any module-specific templates under `app-repo/templates/modules/<moduleName>/`.

8.2 Server Defaults  
- What defaults exist under `STORAGE_ROOT/templates/modules/<moduleName>/`.
- How changes should be applied (never silently to existing projects).

8.3 Per-Project Overrides  
- Where per-project config for this module lives.
- How overrides are resolved (order, precedence).

---

## 9. Testing & Verification

> Align with `_AI_TESTING_AND_VERIFICATION_SPEC.md`.

9.1 Required Test Types  
- Unit tests (what must be covered).
- Integration tests (DB, storage, external services).
- End-to-end tests (main flows).
- Property/consistency checks (if any).

9.2 Invariants to Test  
- Concrete invariants that must be asserted in tests (e.g., “creating a project always creates row X and directory Y”).

9.3 Migration & Rollout Tests  
- How migrations that affect this module must be tested.
- Any canary/rollback rules.

---

## 10. AI Usage Notes (Very Important)

10.1 Required Context For AI  
Before an AI agent modifies this module’s code or spec, it MUST load:

- `_AI_MASTER_RULES.md`
- `_AI_CONTEXT_MAP.md`
- `app-repo/docs/ai/ai-docs-index.json`
- This module spec (`specs/modules/<moduleName>/_MODULE_SPEC.md`)
- Relevant core specs from Section 6.1

10.2 STOP Conditions  
AI MUST STOP and ask a human if:

- Behavior not covered by this spec is required.
- Changes would alter DB schemas or STORAGE_ROOT layout without a destructive-change.json plan.
- Changes touch security, auth, or permissions without reviewing relevant core specs.
- There is any conflict between this spec and another core or module spec.

---

## 11. Open Questions / TODOs

List any unresolved design issues for this module so humans (and AIs) know not to guess.

- [ ] Question 1
- [ ] Question 2

End of `<MODULE_NAME>` module specification.
