# Module: core.storage.ProjectRegistry

## Module ID
core.storage.ProjectRegistry

## 1. Purpose

The `core.storage.ProjectRegistry` module owns the **catalog of projects** known to the application.

It is responsible for:

- Discovering existing projects under the storage root (`.storage/projects`).
- Creating new projects on disk (directory layout + initial `project.json`).
- Opening existing projects and updating their `lastOpenedAt` metadata.
- Providing a typed, `Result`-based API for listing and retrieving projects.

It does **not** own UI behavior, business rules about *when* to create/delete projects, or low-level storage layout (delegated to `ProjectPathResolver` / `StoragePaths`).

## 2. Responsibilities and Non-Responsibilities

### Responsibilities

- Enumerate projects by scanning the projects root directory.
- Use `core.storage.ProjectModel` to:
  - Create initial project metadata (`createNewProject`).
  - Validate and parse `project.json` (`projectFromJson`).
- Use `core.storage.ProjectPathResolver` / `StoragePaths` to:
  - Determine the projects root.
  - Resolve per-project directories and `project.json` locations.
- Provide high-level operations:
  - `listProjects(): Promise<Result<Project[]>>`
  - `getProjectById(id: ProjectId): Promise<Result<Project | null>>`
  - `createProject(args): Promise<Result<Project>>`
  - `openProject(id: ProjectId): Promise<Result<Project>>` (including `lastOpenedAt` update).

### Non-Responsibilities

- Does **not** define the `Project` shape (delegated to `ProjectModel`).
- Does **not** define the filesystem layout (delegated to `ProjectPathResolver` / `StoragePaths`).
- Does **not** own DB schema or migrations (delegated to `core.db` migrations and the planned `MigrationRunner`).
- Does **not** enforce permissions or user-level access rules (delegated to `core.permissions` and higher-level services).
- Does **not** perform UI-level concerns (dialogs, confirmations, etc.).

## 3. Public API

> This section describes the conceptual API. The exact signatures live in
> `src/core/storage/modules/ProjectRegistry.ts` and must remain compatible with this spec.

### Types

- `type ProjectId` and `Project` are imported from `core.storage.ProjectModel`.

- `interface CreateProjectArgs {`
  - `id: ProjectId`
  - `name: string`
  - `createdAt?: string` (optional override; default is `now` if omitted)
  - `}`

- `interface ProjectRegistry {`
  - `listProjects(): Promise<Result<Project[]>>`
  - `getProjectById(id: ProjectId): Promise<Result<Project | null>>`
  - `createProject(args: CreateProjectArgs): Promise<Result<Project>>`
  - `openProject(id: ProjectId): Promise<Result<Project>>`
  - `}`

> The concrete implementation may expose additional helpers, but this is the stable surface expected
> by downstream consumers.

### Behavior

- `listProjects()`:
  - Scans the projects root directory (e.g. `.storage/projects`).
  - For each subdirectory that appears to be a project, attempts to read `project.json`:
    - Uses `ProjectModel.projectFromJson` to validate and parse.
    - Skips entries where `project.json` is missing or invalid, logging diagnostics instead of failing the entire call.
  - Returns `Ok<Project[]>` on success, or `Err` if the scan itself fails (e.g., cannot read the projects root).

- `getProjectById(id)`:
  - Resolves the project directory using `ProjectPathResolver`.
  - Reads and parses `project.json` for that id:
    - If the project cannot be found, returns `Ok<null>` (project not found).
    - If the project exists but `project.json` is invalid, returns `Err` with a validation error.
  - Does not create or modify projects.

- `createProject(args)`:
  - Uses `ProjectModel.createNewProject` to construct a new `Project`.
  - Resolves the project directory layout (root, `project.json`, DB path, etc.) via `ProjectPathResolver` / `StoragePaths`.
  - Creates the project directory and writes `project.json` using the AtomicWrite stack (via higher-level services) or direct `FileStorage` as appropriate.
  - Returns `Ok<Project>` if creation succeeds, or `Err` with a well-defined error code if:
    - The project directory cannot be created.
    - `project.json` cannot be written.
    - A project with the same id already exists.

- `openProject(id)`:
  - Resolves and reads the target project's `project.json`.
  - If the project does not exist, returns a `PROJECT_NOT_FOUND` error.
  - Updates `lastOpenedAt` to `now` and persists the updated metadata.
  - Returns the updated `Project` on success.
  - In the future, this operation is the **intended integration point** for `MigrationRunner`:
    - Before returning, it should ensure that the project's DB schema is up to date.
    - At present, schema migrations are handled by `core.db` migration utilities invoked elsewhere.

## 4. Internal Model and Workflow

### Project discovery

- The projects root is derived from the global storage root:
  - Typically `.storage/projects`.
  - The exact path is provided by `StoragePaths` / `ProjectPathResolver`.
- A project is considered "discoverable" if its directory exists and contains a readable `project.json` that passes `ProjectModel` validation.

### Metadata lifecycle

- On creation:
  - `createProject` constructs `Project` via `ProjectModel.createNewProject`.
  - Synchronously or asynchronously writes `project.json` using the storage pipeline.
- On open:
  - `openProject` reads `project.json`, validates, updates `lastOpenedAt`, and writes it back.

### Interaction with DB and migrations (conceptual)

- The registry **does not** directly own DB migrations.
- When `MigrationRunner` is implemented as a module:
  - `openProject` will become the canonical place to ensure the project's DB schema is at `CURRENT_DB_SCHEMA_VERSION`.
  - For now, DB migration logic is handled by `core.db` migration helpers and tests, not by this module.

## 5. Planned vs Implemented

### Current status

- **Lifecycle status**: `Implemented`
  - Implementation exists at `src/core/storage/modules/ProjectRegistry.ts`.
  - Tests exist in `tests/core/projectRegistry.test.ts`.
  - The module is used in core flows to create/list/open projects.
  - Some aspects (tight coupling to future `MigrationRunner`) are still evolving.

### Planned

- Explicit integration with `core.storage.MigrationRunner`:
  - `openProject` will ensure the project DB is migrated before returning.
- Richer diagnostics:
  - Better error reporting for malformed `project.json` entries during `listProjects`.
- Possible future operations:
  - Archiving/unarchiving projects.
  - Soft-deletion semantics.
  - Tagging/favorite mechanisms (once defined at the Project model level).

## 6. Dependencies

### Upstream dependencies

`core.storage.ProjectRegistry` depends on:

- `core.storage.ProjectModel` for project types and JSON conversion.
- `core.storage.ProjectPathResolver` / `StoragePaths` for path computations.
- `core.storage.FileStorage` and/or the AtomicWrite stack for reading/writing metadata.
- `core.foundation` primitives (logging, diagnostics, Result type), as needed.

It MUST NOT depend on:

- `feature.*` modules.
- UI or UX layers (`core.ui`).
- Application-specific business logic modules.

### Downstream dependents

Expected consumers include:

- `core.runtime` and runtime orchestration services that need to:
  - Show a list of projects.
  - Create or open a project in response to user actions.
- Higher-level services in `feature.*` that want to bind operations to a specific project.

## 7. Error Model

All public functions return `Result<...>`:

- On success: `Ok<...>`.
- On failure: `Err` with:
  - A stable error code, e.g.:
    - `PROJECTS_ROOT_READ_FAILED`
    - `PROJECT_JSON_READ_FAILED`
    - `PROJECT_JSON_PARSE_FAILED`
    - `PROJECT_JSON_VALIDATION_FAILED`
    - `PROJECT_CREATE_FAILED`
    - `PROJECT_NOT_FOUND`
  - A human-readable message for diagnostics.
  - Optional context (e.g., which project id or path caused the error).

Behavioral guarantees:

- `listProjects`:
  - Does not fail the entire operation if one project directory is malformed; it logs and skips that project.
- `getProjectById`:
  - Returns `Ok<null>` if the project does not exist.
  - Returns `Err` if `project.json` cannot be read or parsed for an existing project.
- `createProject`:
  - Returns `PROJECT_CREATE_FAILED` if any of the required filesystem operations fail.
- `openProject`:
  - Returns `PROJECT_NOT_FOUND` if the project directory or `project.json` does not exist.
  - Returns a validation-related error if the metadata is present but invalid.

## 8. Testing Strategy

Tests MUST cover:

- `createProject`:
  - Creating a brand-new project.
  - Failing to create when the directory already exists.
- `listProjects`:
  - Returning all valid projects when multiple exist.
  - Skipping malformed project directories without failing the whole call.
- `getProjectById`:
  - Returning `Ok<null>` for missing projects.
  - Returning `Ok<Project>` for valid projects.
  - Returning errors for invalid `project.json`.
- `openProject`:
  - Successful open and `lastOpenedAt` update.
  - Failure scenarios for missing/invalid `project.json`.

Existing tests:

- `tests/core/projectRegistry.test.ts`
  - Already covers create/list/open in realistic filesystem scenarios.
  - Should be extended as new behaviors (e.g. migrations integration) are implemented.

## 9. Performance Considerations

- `listProjects` should be efficient for the expected number of projects:
  - Uses directory walking under `.storage/projects`.
  - Should avoid unnecessary deep recursion or repeated stat calls.
- `openProject` should remain within the performance budgets for project switching defined at the block/perf level.

For now, `ProjectRegistry` is implicitly covered under the `core.storage` performance budgets in `specs/perf/performance_budget.json`.
Any changes that materially increase the cost of `listProjects` or `openProject` MUST be reflected in those budgets.

## 10. CI / Governance Integration

Any change to:

- The public API of `ProjectRegistry`.
- Its interaction with `ProjectModel` or `ProjectPathResolver`.
- Its semantics around `lastOpenedAt`, project discovery, or error handling.

MUST:

- Update this spec first.
- Update the implementation in `src/core/storage/modules/ProjectRegistry.ts`.
- Update/add tests in `tests/core/projectRegistry.test.ts`.
- Keep the block spec (`specs/blocks/core.storage.md`) and inventory notes for `core.storage` in sync with the actual behavior.
- Ensure `npm run spec:check` passes from the monorepo root.

AI agents and humans MUST follow `_AI_MASTER_RULES.md` and `Spec_Workflow_Guide.md` when evolving this module.
