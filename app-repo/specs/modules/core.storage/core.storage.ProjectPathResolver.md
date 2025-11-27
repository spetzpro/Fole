# Module: core.storage.ProjectPathResolver

## Module ID
core.storage.ProjectPathResolver

## 1. Purpose

The `core.storage.ProjectPathResolver` module provides the **canonical mapping from a `ProjectId` to filesystem paths**.

It is responsible for:

- Turning a `ProjectId` into a concrete project root directory under the storage root.
- Constructing the full paths for:
  - `project.json`
  - `db.sqlite`
  - `files/`, `logs/`, `tmp/`, and `cache/` directories.
- Encapsulating the folder layout rules defined by the `core.storage` block.

This module is the single place where the directory layout for per-project storage is encoded.

## 2. Responsibilities and Non-Responsibilities

### Responsibilities

- Own the deterministic computation of:

  - Projects root (e.g. `.storage/projects`).
  - Project root directory: `.storage/projects/<projectId>/`.
  - Key file paths:
    - `project.json`
    - `db.sqlite`
  - Key folder paths:
    - `files/`
    - `logs/`
    - `tmp/`
    - `cache/`

- Provide a typed API that downstream code can use without re-deriving layout rules.

### Non-Responsibilities

- Does **not** perform any IO itself (no `mkdir`, `readFile`, or `writeFile`).
- Does **not** cache or track project existence; it only computes paths.
- Does **not** define `Project` or `ProjectId` types (delegated to `ProjectModel`).
- Does **not** manage migrations or DB connections (delegated to `core.db` and `DalContextFactory`).
- Does **not** enforce permissions.

## 3. Public API

> This section describes the conceptual API. The exact signatures live in
> `src/core/storage/modules/ProjectPathResolver.ts` and must remain compatible with this spec.

### Types

- `type ProjectId` is imported from `core.storage.ProjectModel`.

- `interface ProjectPaths {`
  - `projectId: ProjectId`
  - `projectRoot: string`
  - `projectJsonPath: string`
  - `dbPath: string`
  - `filesDir: string`
  - `logsDir: string`
  - `tmpDir: string`
  - `cacheDir: string`
  - `}`

- `interface ProjectPathResolver {`
  - `getProjectsRoot(): string`
  - `getProjectRoot(id: ProjectId): string`
  - `getProjectPaths(id: ProjectId): ProjectPaths`
  - `}`

### Behavior

- `getProjectsRoot()`:
  - Returns the path to the projects root directory (e.g. `.storage/projects`), derived from `StoragePaths`.

- `getProjectRoot(id)`:
  - Returns the root directory for the given project:
    - `${getProjectsRoot()}/${id}/`

- `getProjectPaths(id)`:
  - Returns a `ProjectPaths` object with all key paths filled in using a stable naming convention:
    - `projectRoot` = `.storage/projects/<id>/`
    - `projectJsonPath` = `<projectRoot>/project.json`
    - `dbPath` = `<projectRoot>/db.sqlite`
    - `filesDir` = `<projectRoot>/files/`
    - `logsDir` = `<projectRoot>/logs/`
    - `tmpDir` = `<projectRoot>/tmp/`
    - `cacheDir` = `<projectRoot>/cache/`

The exact path separator (`/` vs `\`) depends on the runtime environment; this spec is conceptual,
and the implementation uses Node's `path` utilities.

## 4. Internal Model and Invariants

### Layout invariants

- The projects root is always under the storage root:
  - `projectsRoot = StoragePaths.projectsRoot` (or equivalent).
- For any `ProjectId`:
  - `projectRoot` is `path.join(projectsRoot, projectId)`.
  - All other paths are derived from `projectRoot` with fixed subpaths (`project.json`, `db.sqlite`, `files`, `logs`, `tmp`, `cache`).
- The module MUST NOT introduce ad-hoc variations in these paths; any change to layout MUST be reflected here and in the block spec.

### Stability

- `ProjectPathResolver` is treated as a **Stable** module:
  - Any breaking change to paths is a breaking change to persisted data.
  - Changes to path conventions MUST be handled as migrations and documented in the block spec.

## 5. Planned vs Implemented

### Current status

- **Lifecycle status**: `Stable`
  - Implementation exists at `src/core/storage/modules/ProjectPathResolver.ts`.
  - Paths and layout are exercised indirectly by:
    - `tests/core/storagePaths.test.ts`
    - `tests/core/projectRegistry.test.ts`
  - The module has been used by other storage components and behaves as a stable foundation.

### Planned

- If new project-level folders are introduced (e.g. `snapshots/`, `diagnostics/`):
  - They MUST be added to this spec and the implementation.
  - Corresponding tests MUST be added.
- If the projects root location ever changes (e.g. multi-tenant layouts), this module will be responsible for encoding the new rules.

## 6. Dependencies

### Upstream dependencies

`core.storage.ProjectPathResolver` depends on:

- `StoragePaths` (an internal helper within `core.storage`) for the global storage root.
- Standard Node path utilities (e.g., `path.join`).

It MUST NOT depend on:

- `core.storage.ProjectModel` implementation details (other than the `ProjectId` type).
- `FileStorage`, `ProjectRegistry`, or `DalContextFactory`.
- Any `feature.*` or UI modules.

### Downstream dependents

Expected consumers include:

- `core.storage.ProjectRegistry` — to determine where `project.json` and project directories live.
- `core.storage.DalContextFactory` — to locate the project's DB file.
- Any higher-level orchestration that needs canonical paths for a project.

## 7. Error Model

`ProjectPathResolver` is a **pure path-computation** module:

- It does not perform IO, so it does not produce `Result`-wrapped failures in normal use.
- Errors should only arise from:
  - Misconfiguration of `StoragePaths`.
  - Invalid `ProjectId` values (e.g., containing illegal path characters), which should be prevented earlier in the system.

If, in the future, validation of `ProjectId` is introduced here, this spec MUST be updated to describe how invalid IDs are handled (e.g., via `Result`).

## 8. Testing Strategy

Tests SHOULD cover:

- Correct construction of the projects root path.
- `getProjectRoot` mapping a sample `ProjectId` to the expected directory.
- `getProjectPaths` producing the correct paths and folder layout for:
  - Typical project IDs.
  - Edge-case IDs (e.g., long IDs, IDs with different character sets, within allowed constraints).

Existing tests:

- `tests/core/storagePaths.test.ts` validates storage root paths and project-related paths at a lower level.
- `tests/core/projectRegistry.test.ts` indirectly ensures that the resolver paths work for creating and listing projects.

As additional folders or layout rules are introduced, tests MUST be updated or extended accordingly.

## 9. Performance Considerations

`ProjectPathResolver` performs simple string/path concatenation:

- It has negligible performance impact compared to IO-bound operations.
- It is safe to call frequently.

There is no dedicated performance budget entry for this module; it is implicitly included in the project open/list budgets.

## 10. CI / Governance Integration

Any change to:

- The folder layout (adding/removing/renaming directories or files).
- The projects root location.
- The structure of `ProjectPaths`.

MUST:

- Update this spec first.
- Update the implementation in `src/core/storage/modules/ProjectPathResolver.ts`.
- Update or add tests that validate the new layout.
- Keep the block spec (`specs/blocks/core.storage.md`) and any documentation under `Spec_Workflow_Guide.md` in sync.
- Ensure `npm run spec:check` passes from the monorepo root.

AI agents and humans MUST follow `_AI_MASTER_RULES.md` and the Spec Workflow Guide when evolving this module, keeping specs, implementation, and inventory aligned.
