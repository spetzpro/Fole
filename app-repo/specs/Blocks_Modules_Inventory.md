# Blocks & Modules Inventory

This file is the *single source of truth* for all blocks and modules in the system, plus their current lifecycle state.

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
| core.storage | Block | core | Implemented | Overall storage behavior across modules; StoragePaths + atomic write stack stable; MigrationRunner specced-only; FileStorage atomic pipeline still evolving. | specs/blocks/core.storage.md |
| core.storage | Module | core | Implemented | Storage stack mature overall; ProjectModel/PathResolver behave as Stable, ProjectRegistry/FileStorage/DalContextFactory implemented and used; MigrationRunner currently specced-only. | specs/modules/core.storage |
| core.auth | Block | core | Implemented | Auth flows; AuthApiClient/AuthSessionManager implemented; AuthStateStore/CurrentUserProvider stable; sessions currently in-memory only. | specs/blocks/core.auth.md |
| core.auth | Module | core | Implemented | Auth engine; in-memory session manager plus reactive auth state store and current user provider. | specs/modules/core.auth |
| core.permissions | Block | core | Implemented | Roles and policy engine; PermissionModel/PolicyRegistry/PermissionService stable; PermissionGuards implemented and maturing. | specs/blocks/core.permissions.md |
| core.permissions | Module | core | Implemented | Permission model and engine stable; guards implemented but not yet stable. | specs/modules/core.permissions |
| core.ui | Block | core | Implemented | App shell + workspace UX; UiStateStore + ErrorBoundary/ErrorSurface implemented; AppShell/NavigationRouter/ProjectSelector specced-only. | specs/blocks/core.ui.md |
| core.ui | Module | core | Implemented | UiStateStore + ErrorBoundary/ErrorSurface implemented; AppShell/NavigationRouter/ProjectSelector specced-only. | specs/modules/core.ui |
| core.runtime | Module | core | Planned | Module lifetime, hooks, job scheduling, diagnostics integration. |  |
| core.moduleStateRepository | Module | core | Specced | Versioned module-state storage with atomic writes & schemaVersion rules. |  |
| core.accessControl | Module | core | Specced | Authentication, sessions, PermissionContext, roles→permissions mapping. |  |


---

## Feature Layer

| Name | Kind | Layer | Status | Notes | Spec Path |
| ------------------ | -------- | --------- | ----------- | ------- | ------------ |
| feature.map | Block | feature | Planned | Map viewing, map selection, link to geo + image pipeline. | specs/blocks/feature.map.block.md |
| feature.map | Module | feature | Planned | Map registry, active map state, hooks to map DBs. | specs/modules/feature.map/feature.map.module.md |
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
| lib.image | Lib | lib | Planned | Image normalization, formats, tile handling, ICC, EXIF, etc. |  |
| lib.geo | Lib | lib | Planned | Global→local transform, calibration, coordinate math. |  |
| lib.jobs | Lib | lib | Planned | Background jobs, queueing, progress reporting. |  |
| lib.diagnostics | Lib | lib | Planned | Logging, traces, error reporting helpers shared across modules. |  |

---

## Process Notes

- When you **add or change a module spec** under `specs/modules/**`, update this file.
- When a module’s implementation is merged to `main`, bump its status from `In implementation` → `Implemented` → `Stable` as tests & usage mature.
- Both humans and AI agents should treat this file as the high-level roadmap of what exists and how “done” it is.