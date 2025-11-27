# Module: core.storage.ProjectModel

## Module ID
core.storage.ProjectModel

## 1. Purpose

The `core.storage.ProjectModel` module defines the **canonical in-memory and on-disk representation of a project**.

It is responsible for:

- Defining the `ProjectId` type and the `Project` in-memory shape.
- Defining the `ProjectJsonV1` wire/on-disk JSON format for `project.json`.
- Providing helpers to:
  - Create a new project with default metadata.
  - Convert from `Project` → `ProjectJsonV1` (for persistence).
  - Convert from `ProjectJsonV1` → `Project` (for loading), with validation.
- Enforcing basic invariants on project metadata (required fields, types).

This module is the **single source of truth** for what `project.json` contains and how project metadata is represented inside the app.

## 2. Responsibilities and Non-Responsibilities

### Responsibilities

- Own the **type definitions** for:
  - `ProjectId`
  - `Project`
  - `ProjectJsonV1`
- Perform validation when loading from disk:
  - Ensure required fields are present.
  - Ensure field types match the spec.
  - Reject obviously malformed JSON and return a failure `Result`.
- Provide helper functions:
  - `createNewProject(...)` — construct a new `Project` with default fields.
  - `projectToJson(project: Project)` — produce a `ProjectJsonV1` suitable for persistence.
  - `projectFromJson(json: ProjectJsonV1)` — validate + convert to `Project` inside a `Result`.

### Non-Responsibilities

- Does **not** perform any filesystem IO itself (no `readFile`, `writeFile`).
- Does **not** know where projects live on disk (that is `ProjectPathResolver` / `StoragePaths`).
- Does **not** manage the list of projects or their lifecycle (that is `ProjectRegistry`).
- Does **not** run DB migrations (that is `core.db` migrations and the planned `MigrationRunner`).

## 3. Public API

> This section describes the conceptual API. The exact signatures live in `src/core/storage/model/ProjectModel.ts`
> and must remain compatible with this spec.

### Types

- `type ProjectId = string & { readonly __brand: "ProjectId" };`

- `interface Project {`
  - `id: ProjectId`
  - `name: string`
  - `createdAt: string` (ISO timestamp)
  - `lastOpenedAt: string` (ISO timestamp)
  - `projectVersion: number`
  - `dbSchemaVersion: number`
  - `meta: Record<string, unknown>`
  - `isArchived?: boolean` (optional, future-compatible field)
  - `...` (any additional fields must be added to this spec before implementation)
  - `}`

- `interface ProjectJsonV1 {`
  - Same fields as `Project`, but in a plain JSON-friendly shape.
  - This is the canonical format of `project.json` on disk.
  - `}`

> If additional fields are introduced (e.g., `description`, `favorite`, etc.), they MUST be added to
> this spec first, then implemented, then covered by tests.

### Functions

- `createNewProject(args: { id: ProjectId; name: string; createdAt?: string }): Project`
  - Creates a new `Project` with:
    - `createdAt` set to the provided time or `now` (ISO string).
    - `lastOpenedAt` initially equal to `createdAt`.
    - `projectVersion` initialized to `1`.
    - `dbSchemaVersion` initialized to `1`.
    - `meta` initialized to an empty object (`{}`).
  - Does not perform IO.

- `projectToJson(project: Project): ProjectJsonV1`
  - Converts a valid in-memory `Project` into the JSON representation to be written to `project.json`.
  - Assumes the `Project` object already satisfies module invariants.

- `projectFromJson(json: unknown): Result<Project>`
  - Validates that `json` is a `ProjectJsonV1` with all required fields present and of the correct type.
  - Returns:
    - `Ok<Project>` if validation and conversion succeed.
    - `Err` with a well-defined error code if validation fails (see Error Model).
  - Must tolerate additional unknown fields by ignoring them or handling them according to the module's invariants.

## 4. Internal Model and Invariants

### Invariants

- Every `Project` has:
  - A non-empty `id` (ProjectId).
  - A non-empty `name`.
  - ISO 8601 strings for `createdAt` and `lastOpenedAt`.
  - `projectVersion >= 1`.
  - `dbSchemaVersion >= 1`.
  - `meta` is always a plain object (`Record<string, unknown>`).

- The on-disk `project.json` file is expected to conform exactly to `ProjectJsonV1`.
  - Missing required fields cause `projectFromJson` to fail.
  - Type mismatches cause `projectFromJson` to fail.
  - Extra fields are either ignored or mapped into `meta` if explicitly supported.

- `createNewProject` MUST:
  - Produce a `Project` that passes all invariants.
  - Be deterministic for a given `(id, name, createdAt)`.

### Versioning

- This spec defines `ProjectJsonV1`:
  - All schema evolution MUST be done through:
    - Adding new fields in a backward-compatible way, or
    - Introducing `ProjectJsonV2` and corresponding migration logic.
  - At the time of this spec, the module only supports V1; future versions MUST be added here first.

## 5. Planned vs Implemented

### Current status

- **Lifecycle status**: `Stable`
  - Implementation exists (`src/core/storage/model/ProjectModel.ts`).
  - Tests exist (`tests/core/projectModel.test.ts`).
  - The module is used by `ProjectRegistry` and other core storage components.
  - Spec and implementation are closely aligned.

### Planned

- Future schema versions:
  - `ProjectJsonV2`, `ProjectJsonV3`, etc., to support additional metadata.
  - Migration helpers to map older versions into the current `Project` shape.
- Additional fields:
  - Any new project-level metadata fields are considered **Planned** until added to this spec and implemented.

## 6. Dependencies

### Upstream dependencies

`core.storage.ProjectModel` depends on:

- `core.foundation.CoreTypes` (for `Result` / basic types), if applicable.
- Language/runtime primitives only (Date handling, string operations, etc.).

It MUST NOT depend on:

- `FileStorage` (no IO).
- `ProjectRegistry`, `ProjectPathResolver`, `DalContextFactory`, or `MigrationRunner`.
- Any `feature.*` modules.

### Downstream dependents

The following modules are expected to depend on `core.storage.ProjectModel`:

- `core.storage.ProjectRegistry`
- `core.storage` block-level orchestration code.
- Any higher-level services that need to read/write `project.json` through `ProjectRegistry`.

## 7. Error Model

`projectFromJson` returns a `Result<Project>`:

- On success: `Ok<Project>`.
- On failure: `Err` with:
  - A stable error code, e.g.:
    - `PROJECT_JSON_PARSE_FAILED`
    - `PROJECT_JSON_VALIDATION_FAILED`
  - A human-readable message (for diagnostics).
  - Optional path/context (which fields were invalid).

This module:

- Does **not** throw for expected validation failures.
- May throw only in truly exceptional cases (e.g., programmer errors), but such cases should be avoided in practice.

## 8. Testing Strategy

Tests MUST cover:

- `createNewProject`:
  - Producing a valid `Project` with default versions and meta.
- `projectToJson`:
  - Round-tripping a valid `Project` to `ProjectJsonV1`.
- `projectFromJson`:
  - Round-tripping from `ProjectJsonV1` and back.
  - Failure cases:
    - Missing required fields.
    - Type mismatches (e.g., `name` not a string).
    - Malformed or unexpected structure.

Existing tests:

- `tests/core/projectModel.test.ts`
  - Covers the core create/round-trip and basic validation scenarios.
  - Should be kept in sync with this spec as fields are added or versioning is introduced.

## 9. Performance Considerations

`core.storage.ProjectModel` itself is lightweight and pure in-memory logic:

- It should have negligible impact on performance budgets under normal conditions.
- Validation and conversion functions should avoid unnecessary allocations and deep copies where possible.

There is no separate performance budget entry for this module; it is implicitly included in the project open/list budgets under `core.storage`.

## 10. CI / Governance Integration

Any change to:

- The `Project` or `ProjectJsonV1` shape.
- The invariants enforced by `projectFromJson`.
- The behavior of `createNewProject`.

MUST:

- Update this spec first.
- Update the implementation in `src/core/storage/model/ProjectModel.ts`.
- Update or add tests in `tests/core/projectModel.test.ts`.
- Ensure `npm run spec:check` passes from the monorepo root.

AI agents and humans working on this module MUST follow `_AI_MASTER_RULES.md` and `Spec_Workflow_Guide.md`, keeping:

- Block spec: `specs/blocks/core.storage.md`
- Module spec: this file
- Inventory entries for `core.storage`
- Dependencies and performance budgets

in sync with the actual implementation and tests.
