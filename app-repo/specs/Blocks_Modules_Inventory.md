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

| Name               | Kind   | Layer | Status            | Notes |
|--------------------|--------|-------|-------------------|-------|
| core.foundation    | Module | core  | In implementation  | Basic app/runtime primitives, env, logging hooks, etc. |
| core.storage       | Block  | core  | Specced           | Overall storage behavior across modules. |
| core.storage       | Module | core  | Stable            | StoragePaths, atomic write services, manifests; implementation aligned with specs. |
| core.auth          | Block  | core  | Specced           | Auth flows and UX. |
| core.auth          | Module | core  | Implemented       | Auth engine, session management, identity. |
| core.permissions   | Block  | core  | Specced           | Roles, overrides, UX & behavior. |
| core.permissions   | Module | core  | Implemented       | Permission model, policy registry, service, guards. |
| core.ui            | Block  | core  | Specced           | App shell, navigation, workspace experience. |
| core.ui            | Module | core  | Implemented       | UI state, router, layout, error boundaries, project selector. |
| core.runtime       | Module | core  | Planned           | Module lifetime, hooks, job scheduling, diagnostics integration. |
| core.moduleStateRepository | Module | core  | Specced          | Versioned module-state storage with atomic writes & schemaVersion rules. |
| core.accessControl        | Module | core  | Specced          | Authentication, sessions, PermissionContext, roles→permissions mapping. |


---

## Feature Layer

| Name             | Kind   | Layer   | Status    | Notes |
|------------------|--------|---------|-----------|-------|
| feature.map      | Block  | feature | Planned   | Map viewing, map selection, link to geo + image pipeline. |
| feature.map      | Module | feature | Planned   | Map registry, active map state, hooks to map DBs. |
| feature.sketch   | Block  | feature | Planned   | Sketching tools UI & interactions. |
| feature.sketch   | Module | feature | Planned   | Sketch data model & persistence. |
| feature.files    | Block  | feature | Planned   | File browser UX, upload, links. |
| feature.files    | Module | feature | Planned   | File metadata, storage integration. |
| feature.comments | Block  | feature | Planned   | Comment UI, side panels, activity. |
| feature.comments | Module | feature | Planned   | Comment persistence, threading, permissions. |
| feature.measure  | Block  | feature | Planned   | Measurement tools on maps/sketches. |
| feature.measure  | Module | feature | Planned   | Measurement math, snapping, tolerances. |

---

## Library / Technical Modules

| Name        | Kind | Layer | Status  | Notes  |
|-------------|------|-------|---------|--------|
| lib.image   | Lib  | lib   | Planned | Image normalization, formats, tile handling, ICC, EXIF, etc. |
| lib.geo     | Lib  | lib   | Planned | Global→local transform, calibration, coordinate math. |
| lib.jobs    | Lib  | lib   | Planned | Background jobs, queueing, progress reporting. |
| lib.diagnostics | Lib | lib | Planned | Logging, traces, error reporting helpers shared across modules. |

---

## Process Notes

- When you **add or change a module spec** under `specs/modules/**`, update this file.
- When a module’s implementation is merged to `main`, bump its status from `In implementation` → `Implemented` → `Stable` as tests & usage mature.
- Both humans and AI agents should treat this file as the high-level roadmap of what exists and how “done” it is.
