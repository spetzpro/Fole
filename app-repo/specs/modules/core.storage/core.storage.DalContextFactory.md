# Module: core.storage.DalContextFactory

## Module ID
core.storage.DalContextFactory

## 1. Purpose

The `core.storage.DalContextFactory` module is responsible for creating **per-project database contexts**.

It is responsible for:

- Mapping a `ProjectId` to the correct project database file path.
- Constructing a DAL (Data Access Layer) context bound to that database.
- Providing a simplified, typed interface for executing SQL reads/writes against a project DB.

It does **not** own schema design, migrations, or higher-level business logic; those are handled by `core.db` migrations and other core/runtime modules.

## 2. Responsibilities and Non-Responsibilities

### Responsibilities

- Use `StoragePaths` / `ProjectPathResolver` to compute the DB path for a given `ProjectId`.
- Use the core DB abstractions (`DalContext`, `DbHelpers`, etc.) to open/use the DB.
- Expose a narrow, project-scoped DAL surface (e.g. `run`, `all`) that downstream modules can use.
- Normalize errors into `Result` objects rather than throwing.

### Non-Responsibilities

- Does **not** define SQL schemas or migrations (delegated to `core.db` migrations).
- Does **not** manage multi-project or global transactions.
- Does **not** manage connection pools beyond what `DalContext` and DB infrastructure provide.
- Does **not** handle permissions or tenant isolation beyond selecting the right DB file.

## 3. Public API

> This section describes the conceptual API. The exact signatures live in
> `src/core/storage/modules/DalContextFactory.ts` and must remain compatible with this spec.

### Types

- `type ProjectId` is imported from `core.storage.ProjectModel`.

- `interface SimpleDalContext {`
  - `run(sql: string, params?: unknown[]): Promise<Result<void>>`
  - `all<T = unknown>(sql: string, params?: unknown[]): Promise<Result<T[]>>`
  - `}`

- `interface DalContextFactory {`
  - `createDalContextForProject(projectId: ProjectId): Promise<Result<SimpleDalContext>>`
  - `}`

The concrete implementation may accept additional configuration parameters (e.g. DAL factory, logger),
but those must not change the conceptual behavior described here.

### Behavior

- `createDalContextForProject(projectId)`:
  - Uses `StoragePaths` / `ProjectPathResolver` to compute the DB file path for the given project.
  - Uses the appropriate DAL factory (e.g., `DalContextFactory` from the DB layer) to open a `DalContext` for that DB.
  - Adapts the lower-level DAL API into a `SimpleDalContext` that exposes:
    - `run` for executing write statements.
    - `all` for performing read queries that return lists of rows.
  - Returns:
    - `Ok<SimpleDalContext>` on success.
    - `Err` with a stable error code if:
      - The DB file cannot be opened or initialized.
      - The underlying DAL factory fails for configuration reasons.

## 4. Internal Model and Invariants

### Invariants

- For a valid `ProjectId`, the computed DB path MUST match the canonical layout defined by `ProjectPathResolver`:
  - `.storage/projects/<projectId>/db.sqlite` (conceptual).
- The `SimpleDalContext` returned:
  - Is bound to that DB only (no cross-project queries).
  - Uses the same error model as other DAL operations (`Result` for failures).
- The factory does not cache contexts across calls; connection reuse is handled by the underlying DAL implementation.

### Relationship to migrations

- Schema versioning and migrations are owned by:
  - `core.db` migration utilities.
  - The planned `core.storage.MigrationRunner` module.
- `createDalContextForProject` may be used by migration code, but does not itself trigger or manage migrations.

## 5. Planned vs Implemented

### Current status

- **Lifecycle status**: `Implemented`
  - Implementation exists at `src/core/storage/modules/DalContextFactory.ts`.
  - The module is used in tests and core flows that require project-scoped DB access.
  - Error handling and Result modeling are in place.

### Planned

- Potential future responsibilities:
  - Supporting multiple backing DB types (SQLite, Postgres) with a consistent interface.
  - Optional connection pooling or reuse strategies, if needed for performance.
- Deeper integration with:
  - `core.storage.MigrationRunner` (once implemented), for ensuring schemas are up to date when creating DAL contexts.

## 6. Dependencies

### Upstream dependencies

`core.storage.DalContextFactory` depends on:

- `core.storage.ProjectPathResolver` / `StoragePaths` for computing project DB paths.
- Core DB abstractions:
  - `DalContext`
  - `DbHelpers`
  - DAL factories exposed by the DB layer (e.g., `SqliteDalContext`, `PostgresDalContext` infrastructure).
- Shared types for `Result` / error modeling from `core.foundation` or equivalent.

It MUST NOT depend on:

- Feature modules (`feature.*`).
- UI or runtime orchestration modules (`core.ui`, `core.runtime`).
- `core.permissions`.

### Downstream dependents

Expected consumers include:

- `core.runtime` or core services that need a project-scoped DB context to perform work.
- Migration utilities (once wired) that need a project DB context for upgrade operations.

## 7. Error Model

The factory returns `Result` objects:

- On success: `Ok<SimpleDalContext>`.
- On failure: `Err` with a stable error code, e.g.:
  - `PROJECT_DB_OPEN_FAILED`
  - `PROJECT_DB_CONFIG_INVALID`
- Errors include:
  - Human-readable context (which project id, path, etc.).
  - Optional underlying error/stack for diagnostics.

The `SimpleDalContext` methods (`run`, `all`) return `Result` as defined in the core DB layer.

## 8. Testing Strategy

Tests SHOULD cover:

- Successful context creation:
  - Given a valid `ProjectId` and existing DB file, `createDalContextForProject` returns a usable `SimpleDalContext`.
- Failure scenarios:
  - DB path cannot be resolved or opened.
  - DAL factory errors.
- Correct path computation:
  - The factory uses the same DB paths as `ProjectPathResolver` / `StoragePaths`.

Existing tests (indirect):

- Several core DB and project tests exercise project-scoped DB operations using DAL contexts.
- As this module’s surface evolves, dedicated unit tests for:
  - `createDalContextForProject` behavior.
  - Error propagation.

SHOULD be added or extended to ensure coverage is explicit.

## 9. Performance Considerations

- Creating a DAL context may involve:
  - Opening a DB connection.
  - Running basic initialization queries.
- The factory itself should avoid heavy work beyond this and rely on DB infrastructure for connection management.
- For high-frequency operations, consumers may:
  - Reuse DAL contexts where appropriate.
  - Or use higher-level abstractions that manage their own connection lifecycle.

Any changes that significantly increase the cost of `createDalContextForProject` MUST be revisited in the performance budget for core DB/ storage operations.

## 10. CI / Governance Integration

Any change to:

- The surface or behavior of `createDalContextForProject`.
- The shape of `SimpleDalContext`.
- The mapping between `ProjectId` and DB paths.

MUST:

- Update this spec first.
- Update the implementation in `src/core/storage/modules/DalContextFactory.ts`.
- Add or update tests that validate the new behavior.
- Keep the `core.storage` block spec and any relevant DB-related specs in sync.
- Ensure `npm run spec:check` passes from the monorepo root.

AI agents and humans MUST follow `_AI_MASTER_RULES.md` and the Spec Workflow Guide when evolving this module, keeping specs, implementation, tests, and inventory aligned.
