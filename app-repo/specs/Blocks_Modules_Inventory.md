# Blocks & Modules Inventory

This file is the *single source of truth* for all blocks and modules in the system, plus their current lifecycle state.
It MUST remain consistent with the canonical JSON inventory (`specs/inventory/inventory.json`) once that file is introduced.

- **Block** = Higher-level feature slice (UX + behavior) that may span multiple modules.
- **Module** = Concrete, code-level unit with a spec in `specs/modules/**` and implementation under `src/**`.
- **Lib** = Shared technical module, mostly without direct UX.

Status legend:

- `Planned` — decided conceptually, no spec yet.
- `Specced` — has a written spec, not implemented.
- `In implementation` — code exists / being written in a branch.
- `Implemented` — code merged to `main`, but not deeply tested.
- `Stable` — code in `main` and covered by tests / used in real flows.

---

## Core Layer

| Name | Kind | Layer | Status | Notes | Spec Path |
| -------------------- | -------- | ------- | ------------------- | ------- | ------------ |
| core.foundation | Module | core | In implementation | Basic app/runtime primitives, env, logging hooks, etc. | specs/modules/core.foundation |
| core.storage | Block | core | Specced | Overall storage behavior across modules. | specs/blocks/core.storage.md |
| core.storage | Module | core | Stable | StoragePaths, atomic write services, manifests; implementation aligned with specs. | specs/modules/core.storage |
| core.auth | Block | core | Stable | Auth flows and UX; AuthSessionManager, AuthStateStore, and CurrentUserProvider implemented and tested. | specs/blocks/core.auth.md |
| core.auth | Module | core | Stable | Auth engine, session management, identity, with pluggable SessionStore-based persistence. | specs/modules/core.auth |
| core.permissions | Block | core | Stable | Roles, overrides, UX & behavior; engine and guards implemented with static canonical role→permission mapping. | specs/blocks/core.permissions.md |
| core.permissions | Module | core | Stable | Permission model, policy registry, service, guards; static canonical role→permission mapping and PermissionContext from CurrentUser.roles implemented and tested. | specs/modules/core.permissions |
| core.ui | Block | core | Specced | App shell, navigation, workspace experience. | specs/blocks/core.ui.md |
| core.ui | Module | core | Implemented | UI state, router, layout, error boundaries, project selector. | specs/modules/core.ui |
| core.runtime | Module | core | Planned | Module lifetime, hooks, job scheduling, diagnostics integration. |  |
| core.moduleStateRepository | Module | core | Planned | Versioned module-state storage with atomic writes & schemaVersion rules. |  |
| core.accessControl | Module | core | Planned | Authentication, sessions, PermissionContext, roles→permissions mapping. |  |


---

## Feature Layer

| Name | Kind | Layer | Status | Notes | Spec Path |
| ------------------ | -------- | --------- | ----------- | ------- | ------------ |
| feature.map | Block | feature | Implemented | Read-side map registry and read-only calibration slice implemented; ActiveMapService, write flows, and full calibration lifecycle planned. | specs/blocks/feature.map.block.md |
| feature.map | Module | feature | In implementation | Map registry and read-only CalibrationService implemented; ActiveMapService, viewport, and write/calibration lifecycle APIs planned. | specs/modules/feature.map/feature.map.module.md |
| feature.sketch | Block | feature | Planned | Sketching tools UI & interactions. |  |
| feature.sketch | Module | feature | Planned | Sketch data model & persistence. |  |
| feature.files | Block | feature | Planned | File browser UX, upload, links. |  |
| feature.files | Module | feature | Planned | File metadata, storage integration. |  |
| feature.comments | Block | feature | Planned | Comment UI, side panels, activity. |  |
| feature.comments | Module | feature | Planned | Comment persistence, threading, permissions. |  |
| feature.measure | Block | feature | Planned | Measurement tools on maps/sketches. |  |
| feature.measure | Module | feature | Planned | Measurement math, snapping, tolerances. |  |

---

## Library / Technical Modules

| Name | Kind | Layer | Status | Notes | Spec Path |
| ------------- | ------ | ------- | --------- | -------- | ------------ |
| lib.image | Lib | lib | Specced | Block specced; no implementation in src/lib/** yet. | specs/blocks/lib/lib.image.md |
| lib.geo | Lib | lib | Specced | Block specced; no implementation in src/lib/** yet. | specs/blocks/lib/lib.geo.md |
| lib.jobs | Lib | lib | Specced | Block specced; no implementation in src/lib/** yet. | specs/blocks/lib/lib.jobs.md |
| lib.diagnostics | Lib | lib | Specced | Block specced; no implementation in src/lib/** yet. | specs/blocks/lib/lib.diagnostics.md |

---

## Process Notes

- When you **add or change a module spec** under `specs/modules/**`, update this file.
- When a module’s implementation is merged to `main`, bump its status from `In implementation` → `Implemented` → `Stable` as tests & usage mature.
- Both humans and AI agents should treat this file as the high-level roadmap of what exists and how “done” it is.
