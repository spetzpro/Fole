# Block: core.storage

## Block ID
core.storage

## 1. Purpose / Responsibility

The `core.storage` block owns **project-scoped storage** on the local filesystem and the
primary project database. It is responsible for:

- Defining the **on-disk layout** for projects under the app's storage root.
- Managing the **project metadata model** (`ProjectModel`) as JSON on disk.
- Providing a consistent **path resolver** for project directories and files.
- Owning the **atomic write pipeline** for project manifests and other critical files.
- Wiring project IDs to **per-project database contexts**.
- Integrating with the global **DB migrations subsystem** to ensure schema currency.

`core.storage` does **not** render data, enforce permissions, or manage UI-facing concerns.
It exposes services that higher-level blocks (core.runtime, core.permissions, feature.*)
consume.

## 2. Scope and Boundaries

### In scope

- Project-level storage layout and conventions.
- Project metadata representation and persistence.
- Mapping from `ProjectId` to filesystem paths:
  - Project root
  - Project DB path
  - Files/logs/tmp/cache directories.
- Atomic write services for project manifests and other critical files.
- Per-project database context creation for the DAL.
- Coordination with the DB migrations layer to ensure project DBs are migrated.

### Out of scope

- UI or UX behavior (loading spinners, progress indicators, etc.).
- Authorization / permission checks (delegated to `core.permissions`).
- Networked storage, cloud object stores, or remote synchronization.
- Business-level decisions about **when** to create/delete projects.
- Schema design and low-level SQL migrations (owned by `core.db` migrations).

### Storage layout invariant (canonical)

Under the app's storage root (e.g. `.storage/`), projects live at:

- `.storage/projects/<projectId>/project.json` — project metadata (ProjectJsonV1).
- `.storage/projects/<projectId>/db.sqlite` — project DB.
- `.storage/projects/<projectId>/files/` — project files.
- `.storage/projects/<projectId>/logs/` — logs and diagnostics related to this project.
- `.storage/projects/<projectId>/tmp/` — temporary files for this project.
- `.storage/projects/<projectId>/cache/` — cache-only artifacts that can be regenerated.

`core.storage` is the only block allowed to define or change these layout rules.

## 3. Block Decomposition (Modules)

`core.storage` is decomposed into the following modules:

- `core.storage.ProjectModel`
- `core.storage.ProjectRegistry`
- `core.storage.ProjectPathResolver`
- `core.storage.FileStorage`
- `core.storage.DalContextFactory`
- `core.storage.MigrationRunner` (spec-only, not yet implemented as a module)

### 3.1 ProjectModel

- Defines `ProjectId`, `Project`, and `ProjectJsonV1` structures.
- Responsible for converting between in-memory and on-disk representations.
- Validates loaded JSON and returns typed `Result<Project>`.

### 3.2 ProjectRegistry

- Lists, creates, and opens projects under `.storage/projects`.
- Owns `project.json` lifecycle, including `lastOpenedAt`.
- Uses `ProjectPathResolver` to determine project locations.
- Intended to coordinate with `MigrationRunner` to ensure DB schema is up to date when opening a project.

### 3.3 ProjectPathResolver

- Provides deterministic filesystem paths for each project:
  - Project root, `project.json`, `db.sqlite`.
  - `files/`, `logs/`, `tmp/`, `cache/` directories.
- Delegates the global storage root to `StoragePaths` (a core.storage internal helper).

### 3.4 FileStorage

- Provides a thin, generic async file IO surface:
  - `readFile`, `readText`
  - `writeFile`, `writeText`
  - `deleteFile`
- Returns `Result` objects instead of throwing.
- Ensures idempotent deletes (`deleteFile` treats non-existent files as success).
- **Does not own atomic write semantics**; atomicity is handled by the AtomicWrite stack.

### 3.5 DalContextFactory

- Creates per-project DB contexts given a `ProjectId`.
- Maps project IDs to DB paths using `StoragePaths` / `ProjectPathResolver`.
- Returns simplified DAL interfaces that wrap core DB helpers (`DbHelpers`, `DalContext`).

### 3.6 MigrationRunner (planned/specced-only)

- Owns the notion of `CURRENT_DB_SCHEMA_VERSION` from the perspective of `core.storage`.
- When implemented, will provide:
  - `ensureProjectDbIsMigrated(project, dalContext): Result<Project>` — ensures a project's DB schema matches the current version and returns an updated `Project`.
- Currently, schema migrations are handled by `core.db` migration utilities, not by this module.

## 4. Planned vs Implemented

This section summarizes the current lifecycle status of `core.storage` modules.
Statuses follow the governance-defined lifecycle:

- `Planned`
- `Specced`
- `In implementation`
- `Implemented`
- `Stable`

### 4.1 Summary table

| Module                              | Status        | Notes                                                                                             |
|-------------------------------------|---------------|---------------------------------------------------------------------------------------------------|
| core.storage (Block-level view)     | Implemented   | Storage stack mature overall; some submodules effectively stable; MigrationRunner specced-only.   |
| core.storage.ProjectModel           | Stable        | Spec + implementation tightly aligned; used and tested.                                          |
| core.storage.ProjectRegistry        | Implemented   | Core flows implemented and tested; migration coordination will evolve with MigrationRunner.      |
| core.storage.ProjectPathResolver    | Stable        | Behavior aligned with storage layout; effectively stable via underlying tests.                   |
| core.storage.FileStorage            | Implemented   | Provides basic IO with Result semantics; may evolve to better express atomic vs non-atomic ops.  |
| core.storage.DalContextFactory      | Implemented   | Used to construct per-project DAL; tests indirect; surface may evolve.                           |
| core.storage.MigrationRunner        | Specced       | Spec exists; no dedicated module implementation yet; migrations handled by core.db today.       |

### 4.2 Notes

- The block's **inventory status** is `Implemented`, not `Stable`, because:
  - Most submodules behave as stable components.
  - `MigrationRunner` is still at the spec-only stage.
  - Some surfaces (notably FileStorage) may evolve as atomic write semantics are clarified.

## 5. Dependencies

### 5.1 Upstream dependencies (what core.storage depends on)

`core.storage` is allowed to depend on:

- `core.foundation`
  - Logging, configuration, diagnostics patterns, and shared types.
- `core.db` (migrations subsystem)
  - SQL migration planners, schema drift detection, and DB connection infrastructure.
- `lib.*` libraries that are explicitly allowed by dependency rules, when needed:
  - e.g., `lib.diagnostics` for richer diagnostics (if/when integrated).

These dependencies must remain consistent with `specs/dependencies/allowed_dependencies.json`.

### 5.2 Downstream dependents (who can depend on core.storage)

The following layers are expected to depend on `core.storage`:

- `core.runtime` — uses project registry, atomic write services, and DAL wiring.
- `core.permissions` — may use project metadata as part of policy decisions.
- `feature.*` modules — read/write project content through higher-level services that ultimately rely on `core.storage`.

No module below the `core` layer (e.g., `lib.*`) is allowed to depend on `core.storage`.

## 6. Error Model

`core.storage` adopts a **Result-based** error model:

- All operations return `Result<T, E>` instead of throwing, where practical.
- Error codes are stable and documented at the module level; examples include:
  - `PROJECT_JSON_READ_FAILED`
  - `PROJECT_JSON_PARSE_FAILED`
  - `PROJECT_DB_OPEN_FAILED`
  - `PROJECT_NOT_FOUND`
  - `FILE_READ_FAILED`
  - `FILE_WRITE_FAILED`
- `FileStorage.deleteFile` is **idempotent**:
  - If the file does not exist, the operation returns success.

Block-level guarantees:

- Callers MUST NOT rely on exceptions for routine storage failures; they MUST handle `Result` failures according to module specs.
- Core invariants and expectations about storage errors (e.g., when to treat a missing project as fatal vs recoverable) are spelled out in the module specs.

## 7. Invariants and Guarantees

`core.storage` guarantees the following invariants:

- **Project layout invariants**
  - If a project is reported as existing by `ProjectRegistry`, its root directory and `project.json` file exist and can be read.
  - When `createProject` succeeds, the project directory and initial `project.json` are durable.

- **Metadata invariants**
  - `ProjectModel` ensures `ProjectJsonV1` conforms to the spec:
    - Required fields are present and well-typed.
    - Unexpected extra fields are either ignored or treated according to the module spec.

- **Atomic write pipeline invariants**
  - The **AtomicWrite stack** (AtomicWriteService, AtomicWriteExecutor, etc.) is responsible for:
    - Writing manifests and other critical files using temp + rename.
    - Ensuring operations are either fully applied or not applied at all.
  - `FileStorage` provides basic IO; it does **not** promise atomicity on its own.

- **DB context invariants**
  - `DalContextFactory` maps `ProjectId` to DB paths consistently via `StoragePaths`.
  - When it returns a DAL context successfully, that context is usable for reads and writes until explicitly closed.

## 8. Performance Considerations

`core.storage` is included in the performance budget via:

- Global budgets (app shell, project switching) in `specs/perf/performance_budget.json`.
- Module-level budgets for:
  - Project open/list operations.
  - Atomic write operations.

Block-level performance expectations:

- Listing projects for a typical workspace should complete within the configured P95 budget.
- Opening a project (including any required migrations) should respect the project-switch budget.
- Atomic writes should be efficient enough not to dominate the latency of typical operations.

Any future changes that might materially affect these budgets must be reflected by:

- Updating `specs/perf/performance_budget.json`.
- Re-running `npm run spec:check`.

## 9. Testing Strategy

`core.storage` expects the following kinds of tests:

- **Unit tests**
  - `ProjectModel` serialization/deserialization, including invalid JSON handling.
  - `ProjectPathResolver` and `StoragePaths` layout correctness.
  - Atomic write pipeline components (using temp directories).

- **Integration tests**
  - Creating, listing, and opening projects end-to-end.
  - Interactions between `ProjectRegistry`, `ProjectPathResolver`, and the atomic write stack.
  - DAL context creation and basic DB operations using `DalContextFactory`.

- **Migration tests (future)**
  - Once `MigrationRunner` is implemented, tests must cover:
    - Fresh DB creation.
    - Upgrading from older schema versions.
    - Handling incompatible or corrupt schemas.

The current test suite already exercises many of these behaviors (project registry, storage paths, atomic writes); this block spec codifies them as **required**.

## 10. CI / Governance Integration

`core.storage` participates in the spec-first governance system:

- Any changes to `core.storage` code, specs, or tests that affect:
  - Storage layout.
  - Atomic write behavior.
  - Project DB wiring.
  - Migrations coordination.
- MUST be accompanied by updates to:
  - This block spec.
  - Relevant module specs under `specs/modules/core.storage/`.
  - Inventory status/notes for `core.storage` (if maturity changes).
  - Dependencies (`specs/dependencies/allowed_dependencies.json`) if dependency edges change.
  - Performance budget (`specs/perf/performance_budget.json`) if performance expectations change.

Before completing such changes, AI agents and humans MUST ensure:

- `npm run spec:check` passes from the monorepo root.
