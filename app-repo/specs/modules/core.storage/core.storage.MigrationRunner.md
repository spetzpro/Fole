# Module: core.storage.MigrationRunner

## Module ID
core.storage.MigrationRunner

## 1. Purpose

The `core.storage.MigrationRunner` module is intended to own the **project-level database schema versioning contract** from the perspective of `core.storage`.

It is responsible for (once implemented):

- Defining the current project DB schema version as seen by `core.storage` (`CURRENT_DB_SCHEMA_VERSION`).
- Ensuring that a project's DB schema is **created or migrated** to the current version when the project is opened.
- Returning an updated `Project` object reflecting the current `dbSchemaVersion`.

At the time of this spec, `core.storage.MigrationRunner` is **Specced but not implemented** as a dedicated module. Schema migration logic lives in the `core.db` migrations subsystem and related tests.

## 2. Responsibilities and Non-Responsibilities

### Responsibilities (planned)

- For a given `Project` and DAL context:
  - Inspect the current `dbSchemaVersion` recorded for the project.
  - Inspect the actual DB schema version in the underlying database.
  - Perform any necessary migrations to bring the DB schema up to `CURRENT_DB_SCHEMA_VERSION`.
  - Update the project's `dbSchemaVersion` metadata when migrations succeed.
- Provide a stable API that `ProjectRegistry` (or similar orchestrators) can call when opening a project.

### Non-Responsibilities

- Does **not** own low-level SQL migrations:
  - These are defined and executed by `core.db` migration utilities.
- Does **not** own higher-level application migrations beyond the DB schema.
- Does **not** manage project lifecycle or registry behavior; it is called *from* those modules.
- Does **not** manage DB connections itself; it accepts a DAL context created by `DalContextFactory`.

## 3. Public API (planned)

> This section describes the intended API surface. It is not yet implemented and serves as a
> contract for future work.

### Types

- `type ProjectId` and `Project` are imported from `core.storage.ProjectModel`.
- `type SimpleDalContext` is imported from `core.storage.DalContextFactory` (or the DB layer abstraction).

### Constants

- `const CURRENT_DB_SCHEMA_VERSION: number`
  - The canonical DB schema version expected by `core.storage`.
  - Must match the latest version in the `core.db` migrations.

### Functions

- `ensureProjectDbIsMigrated(project: Project, dal: SimpleDalContext): Promise<Result<Project>>`
  - Behavior:
    - Reads the actual DB schema version from the project DB (using migration metadata tables).
    - Compares it to `CURRENT_DB_SCHEMA_VERSION`.
    - If the DB is uninitialized:
      - Applies initial schema creation migrations.
      - Sets `project.dbSchemaVersion` to `CURRENT_DB_SCHEMA_VERSION`.
    - If the DB is at an older version:
      - Applies migrations step-by-step up to `CURRENT_DB_SCHEMA_VERSION`.
      - Updates `project.dbSchemaVersion`.
    - If the DB is at a newer, incompatible version:
      - Returns a failure `Result` with a clear error code.
    - If migrations fail:
      - Returns a failure `Result` and does not update `project.dbSchemaVersion`.

## 4. Internal Model and Invariants (planned)

### Invariants

- `CURRENT_DB_SCHEMA_VERSION` MUST be equal to the latest version encoded in the DB migration scripts.
- After a successful call to `ensureProjectDbIsMigrated`:
  - The project's DB schema is at `CURRENT_DB_SCHEMA_VERSION`.
  - The returned `Project` has `dbSchemaVersion === CURRENT_DB_SCHEMA_VERSION`.
- The module does not leave the DB in a partially migrated state:
  - On failure, the DB must be either:
    - At the previous known-good version, or
    - In a clearly flagged error state that prevents normal usage until fixed.

### Migration sources

- This module delegates actual migration steps to:
  - `core.db` migration utilities (e.g., migration planners, SQL generators).
- It orchestrates *when* and *how far* to migrate for a given project, but does not embed SQL.

## 5. Planned vs Implemented

### Current status

- **Lifecycle status**: `Specced`
  - This spec defines the intended responsibilities and API.
  - There is **no dedicated implementation** at `src/core/storage/modules/MigrationRunner.ts` yet.
  - Migration behavior currently lives in the `core.db` migrations subsystem and related tests.
  - `ProjectRegistry` and other modules reference the concept of a migration step but do not call this module.

### Planned implementation steps

- Introduce an implementation file at:
  - `src/core/storage/modules/MigrationRunner.ts`
- Wire it into project open flows:
  - `ProjectRegistry.openProject` (or equivalent) calls `ensureProjectDbIsMigrated` before returning.
- Integrate with `core.db` migration utilities:
  - Use existing migration planners, SQL generators, and drift checkers.
- Update tests:
  - Add dedicated tests for migration orchestration on a per-project basis.

## 6. Dependencies (planned)

### Upstream dependencies

When implemented, `core.storage.MigrationRunner` will depend on:

- `core.storage.ProjectModel`:
  - For `Project` type and `dbSchemaVersion` metadata.
- `core.storage.DalContextFactory` or core DB abstractions:
  - For obtaining a `SimpleDalContext` or equivalent.
- `core.db` migrations layer:
  - Migration planners and sql generators.
  - Schema drift detection.

It MUST NOT depend on:

- UI or runtime layers (`core.ui`, `core.runtime`).
- Feature modules (`feature.*`).
- `core.permissions`.

### Downstream dependents

Expected consumers include:

- `core.storage.ProjectRegistry` (or equivalent project open orchestrator).
- Any service that wants to ensure a project's DB is migrated before performing work.

## 7. Error Model (planned)

`ensureProjectDbIsMigrated` will return `Result<Project>`:

- On success: `Ok<Project>` with an updated `dbSchemaVersion`.
- On failure: `Err` with stable error codes, e.g.:
  - `PROJECT_DB_MIGRATION_FAILED`
  - `PROJECT_DB_VERSION_TOO_NEW`
  - `PROJECT_DB_VERSION_INCONSISTENT`

Errors will include:

- Context about the project id and expected vs actual schema versions.
- Underlying DB/migration error information for diagnostics.

Exact error codes and structures will be finalized during implementation and MUST be captured in this spec.

## 8. Testing Strategy (planned)

Once implemented, tests MUST cover:

- Fresh DB initialization:
  - New project with no DB → initializes schema and sets `dbSchemaVersion`.
- Incremental migrations:
  - DB at older version → migrates stepwise to `CURRENT_DB_SCHEMA_VERSION`.
- Incompatible versions:
  - DB at newer or unknown version → returns a clear error, does not attempt migration.
- Failure scenarios:
  - Migration failure mid-way → returns failure and ensures DB is not left in an indeterminate state.

These tests will likely live under:

- `tests/core/migrations` and/or
- `tests/core/core.storage.MigrationRunner.test.ts` (or similar file).

## 9. Performance Considerations (planned)

- Migrations can be expensive; the module MUST:
  - Run them only when required (i.e., when DB schema version is behind).
  - Surface enough information to upstream layers to communicate migration progress to users (via other modules).
- Impact on project open times:
  - Heavy migrations may be gated by user confirmation or background jobs, depending on UX decisions.
  - Budget implications must be reflected in `specs/perf/performance_budget.json` when implemented.

## 10. CI / Governance Integration

Until implemented:

- This spec serves as a **contract for future work** and a reminder that migration orchestration is part of the storage block's responsibilities.
- Inventory and block-level notes:
  - Must continue to mark `core.storage.MigrationRunner` as `Specced` only.
  - Must not claim that this module is implemented or Stable.

When implementation work starts:

- This spec MUST be refined with:
  - Final API signatures.
  - Concrete error codes.
  - Actual dependency details.
- Implementation MUST be added to `src/core/storage/modules/MigrationRunner.ts`.
- Tests MUST be added and integrated into the core test suite.
- `ProjectRegistry` or equivalent orchestrators MUST start calling `ensureProjectDbIsMigrated`.
- `npm run spec:check` MUST remain green from the monorepo root.

AI agents and humans MUST treat this module as **future work** until an implementation exists and tests demonstrate that behavior matches this spec.
