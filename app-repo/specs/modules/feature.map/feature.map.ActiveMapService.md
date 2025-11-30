# Module: feature.map.ActiveMapService

## Module ID
feature.map.ActiveMapService

## 1. Purpose

The `feature.map.ActiveMapService` module is Specced to manage the **default/active map** per project.

It is responsible for (once implemented):

- Tracking which map is considered the default/active map for a given project.
- Providing APIs to read and update the active map.
- Ensuring consistency (at most one active map per project).
- Enforcing appropriate permissions (`map.read` for reading, `map.manage` for updates).

Currently, there is **no implementation** for this module.

## 2. Planned Responsibilities

- Read API:

  ```ts
  getActiveMap(projectId: string, ctx: PermissionContext): Promise<Result<MapMetadata | null>>;
  ```

- Write API:

  ```ts
  setActiveMap(projectId: string, mapId: string | null, ctx: PermissionContext): Promise<Result<void>>;
  ```

- Behavior:

  - `getActiveMap`:
    - Returns the default map for the project if one is set.
    - Returns `null` if no active map is defined.
    - Enforces `map.read` permissions.

  - `setActiveMap`:
    - Sets or clears the active map for a project.
    - Enforces `map.manage` permissions.
    - Ensures that only one active map is recorded per project.

- Storage:

  - Uses project.db to store the active map (e.g., via project_settings table or a dedicated field).

- Concurrency:

  - Uses AtomicWriteService to ensure consistent updates to active map state.

## 3. Status

- **Lifecycle status**: Specced
  - No implementation exists under `src/feature/map/**`.
  - No tests exist for this module.

## 4. Dependencies

- `core.storage` for project.db integration.
- `core.permissions` for permission checks.
- `FeatureMapService` / `FeatureMapTypes` for MapMetadata.

## 5. Future Testing Strategy

When implemented, tests SHOULD:

- Verify active map read/write behavior under normal conditions.
- Verify permission checks for read/manage.
- Verify concurrency behavior using atomic writes.
