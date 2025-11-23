# _AI_CORE_BUILD_ROADMAP.md  
**Core System Build Roadmap & Progress Tracker**

Version: 1.0.0  
Last Updated: 2025-11-23

This document tracks the implementation of FOLE's core systems according to the `_AI_*.md` specs under `app-repo/specs/core/`.

It is a planning and status aid only. The specs themselves remain the source of truth for behavior and requirements.

---

## 1. Legend

- `[ ]` not started  
- `[~]` in progress  
- `[x]` implemented & tested (per current spec)  
- `(!)` blocked / needs clarification

---

## 2. High-Level Phases

1. Core Storage & DB Foundation  
2. Core Auth, Identity & Roles  
3. Module System & Automation Engine  
4. Core Runtime Operations & Jobs  
5. Observability, Error Handling & Security  
6. Search, Network/API & Integrations  
7. User Preferences & Personalization  
8. Backup, Recovery & Performance/Scaling

Each phase ties directly to one or more core specs.

---

## 3. Phase 1 – Core Storage & DB Foundation

**Related specs:**  
- `_AI_STORAGE_ARCHITECTURE.md`  
- `_AI_DB_AND_DATA_MODELS_SPEC.md`  
- `_AI_CONCURRENCY_AND_LOCKING_SPEC.md`

### 3.1 Storage Architecture

- [~] Implement `STORAGE_ROOT` folder structure as defined in `_AI_STORAGE_ARCHITECTURE.md`.  
- [ ] Implement tmp-directory and atomic rename patterns for all write paths.  
- [ ] Implement manifest table and state transitions (`pending` → `committed`/`aborted`).  
- [~] Implement orphan tmp cleanup respecting manifest rules.  
- [ ] Wire CI checks that block PRs touching storage without spec alignment, as per storage spec.

### 3.2 DB & Data Models

- [~] Implement DAL abstraction for Core / Project / Map DBs per `_AI_DB_AND_DATA_MODELS_SPEC.md`.  
- [ ] Enforce schema conventions (PKs, timestamps, soft delete, FKs).  
- [~] Implement engine-specific mappings (SQLite + Postgres, if used) behind DAL.  
- [~] Implement migration runner consistent with DB spec & destructive-change governance (planner, typed steps, and initial dry-run planning in TS only).  
- [~] Add initial test suite for DAL + migrations.  
- [~] Add shared DAL helper functions for read/write patterns (e.g. `executeWrite`, `executeReadOne`, `executeReadMany`) and cover them with tests.  
- [~] Define initial logical schemas (users, projects, maps) and corresponding typed migration descriptions for core and project DBs.

### 3.3 Concurrency & Locking

- [~] Implement advisory read/write locks per `_AI_CONCURRENCY_AND_LOCKING_SPEC.md`.  
- [ ] Integrate locking with DAL operations and atomic write protocol.  
- [~] Add tests for lock contention, stale lock recovery, and concurrency limits.

---

## 4. Phase 2 – Auth, Identity & Roles

**Related specs:**  
- `_AI_AUTH_AND_IDENTITY_SPEC.md`  
- `_AI_ROLES_AND_PERMISSIONS.md`  
- `_AI_SECURITY_AND_COMPLIANCE_SPEC.md`

### 4.1 Auth & Identity

- [ ] Implement user/identity model and authentication flows per `_AI_AUTH_AND_IDENTITY_SPEC.md`.  
- [ ] Implement session handling, token/credential storage consistent with security spec.  
- [ ] Add tests for login, logout, session expiry, and invite flows.

### 4.2 Roles & Permissions

- [ ] Implement role hierarchy, permission domains, and deny-wins logic per `_AI_ROLES_AND_PERMISSIONS.md`.  
- [ ] Integrate permission checks into DAL/service layer entrypoints.  
- [ ] Add tests for ACL evaluation, edge cases, and escalation prevention.

### 4.3 Security & Compliance

- [ ] Implement minimum security controls from `_AI_SECURITY_AND_COMPLIANCE_SPEC.md` (encryption, audit requirements, etc.).  
- [ ] Ensure destructive operations are gated by governance (destructive-change.json, approvals).  
- [ ] Add tests for key security invariants.

---

## 5. Phase 3 – Module System & Automation Engine

**Related specs:**  
- `_AI_MODULE_SYSTEM_SPEC.md`  
- `_AI_AUTOMATION_ENGINE_SPEC.md`

### 5.1 Module System

- [ ] Implement module discovery and registration per `_AI_MODULE_SYSTEM_SPEC.md`.  
- [ ] Implement module metadata loading (`crossref/ai-library-index.json`).  
- [ ] Enforce dependency rules, no cycles, and capability declarations.  
- [ ] Implement enable/disable flow and validation pipeline.  
- [ ] Add tests for module lifecycle and dependency handling.

### 5.2 Automation Engine

- [ ] Implement automation job definitions and scheduling per `_AI_AUTOMATION_ENGINE_SPEC.md`.  
- [ ] Integrate automation with job/operations system spec.  
- [ ] Add tests for approvals, STOP conditions, and failure handling.

---

## 6. Phase 4 – Operations & Job System

**Related specs:**  
- `_AI_OPERATIONS_AND_JOB_SYSTEM.md`  
- `_AI_FILE_AND_IMAGE_PIPELINE_SPEC.md`  
- `_AI_GEO_AND_CALIBRATION_SPEC.md`

- [ ] Implement job queue, workers, and status tracking per operations spec.  
- [ ] Integrate storage/atomic write rules into all jobs.  
- [ ] Implement file/image pipeline steps and job types.  
- [ ] Implement geo/calibration jobs if required in initial core.  
- [ ] Add tests for job lifecycle, retries, and failure modes.

---

## 7. Phase 5 – Observability, Errors & Security

**Related specs:**  
- `_AI_MONITORING_AND_ALERTING_SPEC.md`  
- `_AI_ERROR_HANDLING_AND_DIAGNOSTICS_SPEC.md`  
- `_AI_SECURITY_AND_COMPLIANCE_SPEC.md`

- [ ] Implement metrics, logging, and alerting thresholds per monitoring spec.  
- [ ] Implement structured error handling and diagnostics interfaces.  
- [ ] Ensure security & compliance hooks (audit logs, access checks) are wired into core flows.  
- [ ] Add tests for alert triggers, error classification, and audit log integrity.

---

## 8. Phase 6 – Search, Network/API & Integrations

**Related specs:**  
- `_AI_SEARCH_AND_INDEXING_SPEC.md`  
- `_AI_NETWORK_AND_API_SPEC.md`  
- `_AI_INTEGRATION_AND_EXTENSIBILITY_SPEC.md`

- [ ] Implement initial search/indexing layer per search spec.  
- [ ] Implement core HTTP/WS APIs and rate limiting per network/API spec.  
- [ ] Implement integration/extensibility hooks as required by early modules.  
- [ ] Add tests for search correctness, API contracts, and extension safety.

---

## 9. Phase 7 – User Preferences & Personalization

**Related specs:**  
- `_AI_USER_PREFERENCES_AND_PERSONALIZATION_SPEC.md`  
- `_AI_TEMPLATES_AND_DEFAULTS.md`

- [ ] Implement user preferences storage & isolation per preferences spec.  
- [ ] Implement resolution order for defaults vs overrides (factory → server → project → user).  
- [ ] Add tests for preference isolation and override behavior.

---

## 10. Phase 8 – Backup, Recovery & Performance/Scaling

**Related specs:**  
- `_AI_BACKUP_AND_RECOVERY_SPEC.md`  
- `_AI_PERFORMANCE_AND_SCALING_SPEC.md`

- [ ] Implement backup & restore flows per backup spec (including safety checks).  
- [ ] Implement core performance budgets and scaling mechanisms per performance spec.  
- [ ] Add tests/load tests for backup correctness and basic performance targets.

---

## 11. Working Session Checklist (for AI + Human)

For each implementation session in this repo:

1. Load:
   - `_AI_MASTER_RULES.md`
   - `_AI_CONTEXT_MAP.md`
   - Relevant core spec(s) for the phase (see above)
2. Identify which checklist items in this roadmap are in scope.  
3. Implement the code changes, keeping behavior aligned with the spec(s).  
4. Add or update tests for the affected behavior.  
5. Update this roadmap and/or the relevant spec status sections if behavior is now implemented.  
6. If any ambiguity or spec gap is found → STOP and request clarification before proceeding.

This roadmap is meant to evolve alongside the specs as you refine the core system.
