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
| core.auth | Block | core | Stable | Auth flows and UX; AuthSessionManager, AuthStateStore, and CurrentUserProvider implemented and tested. User model (user_id, user_external_id, email) and invite-by-email behavior are defined conceptually in the core auth/identity specs. | specs/blocks/core.auth.md |
| core.auth | Module | core | Stable | Auth engine, session management, identity, with pluggable SessionStore-based persistence. | specs/modules/core.auth |
| core.permissions | Block | core | Stable | Roles, overrides, UX & behavior; engine and guards implemented with static canonical role→permission mapping. Role templates and per-project role configuration (canonical + custom roles) are defined at the spec level; MVP runtime effectively supports canonical roles only. | specs/blocks/core.permissions.md |
| core.permissions | Module | core | Stable | Permission model, policy registry, service, guards; static canonical role→permission mapping, `project_members` + `ProjectMembershipService` MVP storage, and membership-aware PermissionContext builders implemented and tested. | specs/modules/core.permissions |
| core.ui | Block | core | Specced | App shell, navigation, workspace experience. | specs/blocks/core.ui.md |
| core.ui | Module | core | Implemented | UI state, router, layout, error boundaries, project selector. | specs/modules/core.ui |
| core.runtime | Module | core | Planned | Module lifetime, hooks, job scheduling, diagnostics integration. |  |
| core.moduleStateRepository | Module | core | Planned | Versioned module-state storage with atomic writes & schemaVersion rules. |  |
| core.accessControl | Module | core | Planned | Authentication, sessions, PermissionContext, roles→permissions mapping. |  |


---

## Feature Layer

| Name | Kind | Layer | Status | Notes | Spec Path |
| ------------------ | -------- | --------- | ----------- | ------- | ------------ |
| feature.map | Block | feature | Implemented | Read-side map registry, read-only calibration slice, and a membership-enforced `createMap` write flow implemented; map read/write and calibration operations use core.permissions with a membership-aware PermissionContext (PROJECT_READ/PROJECT_WRITE, MAP_EDIT, MAP_CALIBRATE, PROJECT_EXPORT). | specs/blocks/feature.map.block.md |
| feature.map | Module | feature | In implementation | Map registry, read-only CalibrationService, and a membership-backed `createMap` (MAP_EDIT) implemented; all map permission checks delegate to core.permissions using a membership-aware PermissionContext. | specs/modules/feature.map/feature.map.module.md |
| feature.sketch | Block | feature | Planned | Sketching tools UI & interactions; sketch read/write behavior will use core.permissions with membership-aware PermissionContext (SKETCH_EDIT and future view actions). |  |
| feature.sketch | Module | feature | Planned | Sketch data model & persistence; sketch operations will enforce SKETCH_EDIT via core.permissions and project membership. |  |
| feature.files | Block | feature | In implementation | File browser UX, upload, links; backend MVP implements file upload/delete using FILE_READ/FILE_WRITE via core.permissions and a membership-aware PermissionContext (FILE_WRITE for upload/delete, FILE_READ as the surface expands). Binary storage, listing/search, attachments, and advanced metadata remain future arcs. |  |
| feature.files | Module | feature | In implementation | File metadata and storage integration; backend MVP implements file upload/delete using FILE_READ/FILE_WRITE via core.permissions. |  |
| core.exportImport | Module | core | In implementation | Project export/import services; project.db (including `project_members`) is preserved on import. Imported membership rows and role_ids are not yet automatically mapped to local users or local role configs; future membership and role mapping flows are described in the export/import and DB/data model specs. | specs/modules/core.exportImport |
| core.permissions        | Block | core | Stable | Roles, overrides, UX & behavior; engine and guards implemented with static canonical role→permission mapping (including PROJECT_EXPORT). | specs/blocks/core.permissions.md |
| core.permissions        | Module | core | Stable | Permission model, policy registry, service, guards; static canonical role→permission mapping, `project_members` + `ProjectMembershipService` MVP storage, and membership-aware PermissionContext builders implemented and tested, with SecuredProjectExportService enforcing PROJECT_EXPORT. | specs/modules/core.permissions |
| feature.comments | Block | feature | In implementation | Comment UI and activity surfaces; MVP focuses on basic create/delete flows. |  |
| feature.comments | Module | feature | In implementation | Comment persistence and permissions; backend MVP implements create/delete using COMMENT_* actions via core.permissions with a membership-aware PermissionContext. Threads, edit flows, ownership-aware rules, and notifications remain future arcs. |  |
| feature.measure | Block | feature | Planned | Measurement tools on maps/sketches; measurement read/write will use core.permissions with membership-aware PermissionContext and measurement-related PermissionActions. |  |
| feature.measure | Module | feature | Planned | Measurement math, snapping, tolerances; measurement APIs will delegate permission checks to core.permissions using project membership and related PermissionActions. |  |

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
