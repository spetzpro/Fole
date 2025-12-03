# Module Specification: debug.projectOverview

## Module ID
debug.projectOverview

## Purpose
Provides a **dev/debug-only** module that exposes a high-level overview of projects and their feature data (maps, files, comments) while strictly respecting existing permission rules.

This module is **not tenant-facing** and is intended for developers and operators to inspect the state of projects in a controlled environment.

## DTO Shapes

### `ProjectListItem`

```ts
interface ProjectListItem {
  id: string;
  name: string;
  createdAt?: string;
  lastOpenedAt?: string;
}
```

### `ProjectOverviewDto`

```ts
interface ProjectOverviewDto {
  project: ProjectListItem;
  mapsSummary: {
    total: number;
    items: Array<{
      id: string;
      name: string;
      hasCalibration?: boolean;
    }>;
  };
  filesSummary: {
    total: number;
    items: Array<{
      id: string;
      name: string;
      contentType: string;
      sizeBytes: number;
      createdAt: string;
      createdBy?: string;
    }>;
  };
  commentsSummary: {
    total: number;
    items: Array<{
      commentId: string;
      anchorType: string;
      anchorId: string;
      createdAt: string;
      createdBy?: string;
    }>;
  };
}
```

## Responsibilities

- Provide read-only, permission-respecting views over project-level feature data for debugging and inspection.
- Never perform writes or mutations beyond delegating to already-implemented, write-capable services (e.g., this module must not create or modify projects, maps, files, or comments).
- Centralize logic for aggregating a per-project overview from existing feature services.

## Permissions

- All data access from this module MUST require `PROJECT_READ` for the project in question.
- If `PROJECT_READ` is denied for a project, the service MUST return a failure `Result` with an `AppError` using the established pattern:
  - `code: "PERMISSION_DENIED"`
  - `message: "Permission denied"`
  - `details: { reasonCode, grantSource }` (copied from the `PermissionDecision`).
- When no `CurrentUser` is available (e.g., unauthenticated context), this module MUST return a `PERMISSION_DENIED` `AppError` with `details.reasonCode = "NOT_AUTHENTICATED"`.
- This module does **not** introduce new permission concepts; it defers entirely to `core.permissions` and existing project/feature policies.

## Behavior Overview

### `listProjectsForCurrentUser()`

- Resolves the current user via `core.auth`.
- If no current user is present, returns `PERMISSION_DENIED` with `reasonCode = "NOT_AUTHENTICATED"`.
- Uses `core.storage`'s `ProjectRegistry.listProjects()` to enumerate all registered projects.
- For each project, builds a membership-aware `PermissionContext` using `ProjectMembershipService` and
  `buildProjectPermissionContextForCurrentUser(project.id, ProjectMembershipService)`.
- Delegates to `core.permissions.PermissionService.canWithReason("PROJECT_READ", { type: "project", id: project.id, projectId: project.id })`.
- Includes only projects for which `PROJECT_READ` is granted.

### `getProjectOverviewForCurrentUser(projectId)`

- Resolves the current user via `core.auth`.
- If no current user is present, returns `PERMISSION_DENIED` with `reasonCode = "NOT_AUTHENTICATED"`.
- Uses `ProjectRegistry.getProjectById(projectId)` to load the project:
  - If the project does not exist, returns a `NOT_FOUND` `AppError` with `details: { projectId }`.
- Builds a membership-aware `PermissionContext` for the project and enforces `PROJECT_READ`.
  - On denial, returns `PERMISSION_DENIED` with `details: { reasonCode, grantSource }` from the permission decision.
- On success, aggregates a `ProjectOverviewDto` by delegating to existing feature services:
  - **Maps summary**: uses `feature.map` read APIs (e.g., `FeatureMapService.listMaps`) and maps results to `{ id, name, hasCalibration? }`.
  - **Files summary**: uses `feature.files` read APIs when available. If no suitable read API exists yet, returns `filesSummary.total = 0` and an empty `items` array, with a clear TODO in code/spec for a follow-up arc.
  - **Comments summary**: uses `feature.comments` read/query APIs when available. If not yet implemented, returns `commentsSummary.total = 0` and an empty `items` array, with a TODO for follow-up.

## Notes and Constraints

- **Dev/debug-only**: This module is explicitly for internal/developer/debug usage and is not a tenant-facing feature.
- **Read-only**: This module MUST NOT create, update, or delete any domain data; it only reads via existing services and aggregates results.
- **Extensibility**: Future arcs may extend the DTOs and behavior to include invites, membership, and other per-project metrics, but those are deliberately out of scope for this MVP.
- **Spec precedence**: This module must remain consistent with core specs such as `_AI_DB_AND_DATA_MODELS_SPEC.md`, `_AI_STORAGE_ARCHITECTURE.md`, `_AI_AUTH_AND_IDENTITY_SPEC.md`, and `_AI_ROLES_AND_PERMISSIONS.md`. If conflicts are discovered, core specs take precedence and this module spec must be updated accordingly.
