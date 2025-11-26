# Feature Map Active Map Service — Spec

**File:** `specs/modules/feature.map/feature.map.ActiveMapService.md`  
**Module:** `feature.map`  
**Status:** Specced

---

## 1. Purpose

`FeatureMapActiveService` manages the **active map** for a project.

It is responsible for:

- Tracking **which map is currently active** in a project.
- Ensuring at most **one active map per project**.
- Enforcing permissions for setting the active map.
- Providing a simple read API to get the active map (or `null`).

By default, the active map is **project-global** (shared between users), not per-user.

---

## 2. Public API

```ts
interface FeatureMapActiveService {
  getActiveMap(
    projectId: ProjectId,
    ctx: PermissionContext
  ): Promise<MapMetadata | null>;

  setActiveMap(
    projectId: ProjectId,
    mapId: MapId | null,
    ctx: PermissionContext
  ): Promise<MapMetadata | null>;
}
```

- `ProjectId`, `MapId`, `MapMetadata`, `PermissionContext` are shared types from core and `FeatureMapTypes`.

---

## 3. Semantics

### 3.1 Single active map per project

- There is at most **one active map per project** at a time.
- If no active map has been set yet, `getActiveMap` returns `null`.

### 3.2 Storage model

- Active map state is stored in project-scoped storage, e.g.:
  - A row in a `project_settings` table in `project.db`, or
  - A dedicated `active_map` field on a project state record.
- Exact schema is defined in `_AI_DB_AND_DATA_MODELS_SPEC.md` and `_AI_STORAGE_ARCHITECTURE.md`.
- In-memory caching is allowed, but persistence in `project.db` is the source of truth.

### 3.3 `getActiveMap`

- Returns the `MapMetadata` for the current active map in the project, or `null`.
- If there is an active map but the caller lacks `map.read`, the service may:
  - Return `null`, or
  - Throw an access error.

The recommended behavior is:

- If the caller lacks `map.read` for the active map, treat as **no visible active map** and return `null`.

### 3.4 `setActiveMap`

- `mapId === null`:
  - Clears the active map.
  - Requires `map.manage` for the project.

- `mapId !== null`:
  - Validates that the target map exists and is readable by the caller (`map.read`).
  - Requires `map.manage` to change active map state.
  - Sets this map as the active map for the project.
  - Clears any previously active map (so there is exactly one).

Returns:

- The metadata for the new active map, or `null` if cleared.

### 3.5 Permissions

- `getActiveMap`:
  - Requires `map.read` on the project; if not present, returns `null` or throws `AccessDeniedError`.

- `setActiveMap`:
  - Requires `map.manage`.
  - Must also guard against setting a map that the caller cannot read.

### 3.6 Concurrency

- Changing the active map must be atomic:
  - Only one active map is persisted at the end of the operation.
  - Concurrent callers trying to change the active map must not cause inconsistent state.

Implementations should use core atomic write mechanisms (e.g. versioned project state) to enforce this.

---

## 4. Dependencies

- `FeatureMapService` or underlying DAL to:
  - Validate that `mapId` exists and is readable.
  - Fetch `MapMetadata`.
- Core storage / project state.
- `core.accessControl` / `core.permissions` for `PermissionContext`.

---

## 5. Error Model

- `AccessDeniedError`
  - Insufficient permissions (`map.manage` or `map.read`).

- `MapNotFoundError`
  - Target map does not exist in the project when setting as active.

- `ConcurrencyError`
  - When concurrent attempts to change the active map conflict.

All errors must be cleanly mappable to `UiError`.

---

## 6. Testing Strategy

1. **No active map by default**
   - `getActiveMap` returns `null` for a new project.

2. **Set active map**
   - Setting valid `mapId` results in `getActiveMap` returning that map.

3. **Clear active map**
   - Setting `mapId = null` clears the active map (subsequent `getActiveMap` returns `null`).

4. **Permissions**
   - Caller without `map.manage` cannot change the active map.
   - Caller without `map.read` cannot see a readable active map (returns `null` or access error according to final behavior).

5. **Concurrency**
   - Simulate concurrent `setActiveMap` calls; verify only one result is persisted.
