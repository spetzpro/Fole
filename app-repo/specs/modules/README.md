# Modules Overview

This file is the canonical index of all blocks and modules in the system.

It is meant to be read by:
- humans (to understand the architecture)
- AI agents (to know what modules exist and where their specs live)

Status is **spec-level**, not implementation-level. A module can be SPEC_READY even if no code exists yet.

---

## 1. Blocks

### Core Blocks

- `core.foundation`
- `core.storage`
- `core.auth`
- `core.permissions`
- `core.ui`

### Future Blocks (not yet spec'd)

- `lib.*` blocks (shared low-level libraries)
- `feature.*` blocks (maps, sketches, files, comments, geo, image pipeline, etc.)

---

## 2. Modules by Block

### 2.1 core.foundation

Spec files under: `specs/modules/core.foundation/`

| Module                              | Status      | Notes                                     |
|-------------------------------------|-------------|-------------------------------------------|
| core.foundation.ConfigService       | SPEC_READY  | Central app configuration access          |
| core.foundation.Logger              | SPEC_READY  | Scoped, leveled logging                   |
| core.foundation.DiagnosticsHub      | SPEC_READY  | Diagnostics/event aggregation              |
| core.foundation.FeatureFlags        | SPEC_READY  | Feature flag access helpers               |
| core.foundation.CoreTypes           | SPEC_READY  | Result/AppError/shared base types         |

---

### 2.2 core.storage

Spec files under: `specs/modules/core.storage/`

| Module                              | Status      | Notes                                      |
|-------------------------------------|-------------|--------------------------------------------|
| core.storage.ProjectModel           | SPEC_READY  | Project entities and basic shapes          |
| core.storage.ProjectPathResolver    | SPEC_READY  | Map projectId → filesystem paths           |
| core.storage.FileStorage            | SPEC_READY  | Binary file IO for project files           |
| core.storage.ProjectRegistry        | SPEC_READY  | List/create/delete projects                 |
| core.storage.DalContextFactory      | SPEC_READY  | Per-project DB context creation            |
| core.storage.MigrationRunner        | SPEC_READY  | DB migration execution per project         |

---

### 2.3 core.auth

Spec files under: `specs/modules/core.auth/`

| Module                              | Status      | Notes                                      |
|-------------------------------------|-------------|--------------------------------------------|
| core.auth.AuthApiClient             | SPEC_READY  | Low-level HTTP client for auth backend     |
| core.auth.AuthSessionManager        | SPEC_READY  | Token/session lifecycle handling           |
| core.auth.CurrentUserProvider       | SPEC_READY  | Current user identity + roles              |
| core.auth.AuthStateStore            | SPEC_READY  | Auth state (authenticated/unauth/etc.)     |

---

### 2.4 core.permissions

Spec files under: `specs/modules/core.permissions/`

| Module                              | Status      | Notes                                      |
|-------------------------------------|-------------|--------------------------------------------|
| core.permissions.PermissionModel    | SPEC_READY  | Roles, actions, PermissionContext, Result  |
| core.permissions.PolicyRegistry     | SPEC_READY  | Register/lookup policy handlers            |
| core.permissions.PermissionService  | SPEC_READY  | Evaluate permissions via policies          |
| core.permissions.PermissionGuards   | SPEC_READY  | Convenience helpers for callers (UI, svc)  |

---

### 2.5 core.ui

Spec files under: `specs/modules/core.ui/`

| Module                              | Status      | Notes                                      |
|-------------------------------------|-------------|--------------------------------------------|
| core.ui.AppShell                    | SPEC_READY  | Top-level React shell                      |
| core.ui.NavigationRouter            | SPEC_READY  | In-memory router for core screens          |
| core.ui.UiStateStore                | SPEC_READY  | Global UI state (current project, panel)   |
| core.ui.ProjectSelector             | SPEC_READY  | Project list + create/open UI              |
| core.ui.ErrorBoundary               | SPEC_READY  | React error boundary component             |

---

## 3. How AI Agents Should Use This File

- Always read this file before:
  - adding new modules
  - modifying existing specs
  - generating implementation code for core/feature modules
- When introducing a new module:
  - add its spec file under `specs/modules/<block>/`
  - register it in this README under the appropriate block
  - set status to `SPEC_DRAFT` or `SPEC_READY`
- When a module's implementation is confirmed as stable in code:
  - status can be updated to include implementation info if desired
    (e.g. `SPEC_READY / IMPL_WIP`, `SPEC_READY / IMPL_DONE`).

This README is the **single source of truth** for the spec-level module inventory.
