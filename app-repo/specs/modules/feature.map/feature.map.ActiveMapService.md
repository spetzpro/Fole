# Feature Map Active (Default) Map Service — Spec

**File:** `specs/modules/feature.map/feature.map.ActiveMapService.md`  
**Module:** `feature.map`  
**Status:** Specced

---

## 1. Purpose

`FeatureMapActiveService` manages the **project default map** for a project.

It is responsible for:

- Tracking **which map is the default entry map** for a project.
- Ensuring at most **one default map per project**.
- Enforcing permissions for changing the default map.
- Providing a read API to get the current default map (or `null`).

It does **not**:

- Lock editing or viewing to a single map.
- Track per-user or per-device “last used map” state — that belongs to the UI/client layer (browser storage, Core UI state, etc.).

Any user with appropriate permissions may open and work on any map they can access, **regardless** of which map is currently the default.

---

## 2. Public API

```ts
interface FeatureMapActiveService {
  /**
   * Get the current default map for this project, if any.
   */
  getActiveMap(
    projectId: ProjectId,
    ctx: PermissionContext
  ): Promise<MapMetadata | null>;

  /**
   * Set or clear the default map for this project.
   * Passing null clears the default.
   */
  setActiveMap(
    projectId: ProjectId,
    mapId: MapId | null,
    ctx: PermissionContext
  ): Promise<MapMetadata | null>;
}
```

- `ProjectId`, `MapId`, `MapMetadata`, `PermissionContext` are shared types defined by the core + `FeatureMapTypes`.

---

## 3. Semantics

### 3.1 Single default map per project

- There is at most **one default map per project** at any time.
- If no default map has been set yet, `getActiveMap` returns `null`.

This does **not** restrict which maps users can open; it only defines what the system considers the **“home” or “starting” map** for a project when no specific map is requested.

### 3.2 Storage model

- Default map state is stored in project-scoped storage, e.g.:
  - A row in a `project_settings` table in `project.db`, or
  - A dedicated `default_map_id` field on a project state record.
- Exact schema is defined in `_AI_DB_AND_DATA_MODELS_SPEC.md` and `_AI_STORAGE_ARCHITECTURE.md`.
- In-memory caching is allowed, but persistence in `project.db` is the **source of truth**.

### 3.3 `getActiveMap` (get project default map)

- Returns the `MapMetadata` for the current default map in the project, or `null`.
- If there is a default map but the caller lacks `map.read` for that map, the service should either:
  - Treat it as **no visible default map** and return `null`, or
  - Throw an `AccessDeniedError`.

**Recommended behavior:** return `null` when the caller cannot read the default map.

### 3.4 `setActiveMap` (set project default map)

- `mapId === null`:
  - Clears the default map for the project.
  - Requires `map.manage`.

- `mapId !== null`:
  - Validates that the target map exists for `(projectId, mapId)` and is readable by the caller (`map.read`).
  - Requires `map.manage` to change the default map state.
  - Writes this map as the **new default map** for the project.
  - Replaces any previously stored default map.

Returns:

- The metadata for the new default map, or `null` if the default was cleared.

### 3.5 Permissions

- `getActiveMap`:
  - Requires `map.read` on the project; if not present, returns `null` (recommended) or throws `AccessDeniedError`.

- `setActiveMap`:
  - Requires `map.manage`.
  - Must also guard against setting a map that the caller cannot read (`map.read`).

### 3.6 Concurrency

- Changing the default map must be **atomic**:
  - Only one default map entry is persisted for the project at the end of the operation.
  - Concurrent callers trying to change the default map must not cause inconsistent state (e.g., two different defaults).

Implementations should use the standard core atomic write mechanisms (e.g. versioned project state via `ModuleStateRepository` or equivalent) to enforce this.

---

## 4. Dependencies

- `FeatureMapService` or underlying DAL to:
  - Validate that `mapId` exists and is visible to the caller.
  - Fetch `MapMetadata`.
- Core storage / project state:
  - Project settings/state table(s) in `project.db`.
- `core.accessControl` / `core.permissions`:
  - For `PermissionContext`, `map.read`, `map.manage`.

---

## 5. Error Model

- `AccessDeniedError`
  - Thrown when the caller lacks `map.manage` for `setActiveMap`, or (optionally) `map.read` for `getActiveMap`.

- `MapNotFoundError`
  - Thrown when `setActiveMap` is called with a `mapId` that does not exist for this project.

- `ConcurrencyError`
  - Thrown when conflicting state changes are detected during an atomic write.

All errors must be mappable to:

- A domain error code, and
- `UiError` via the `Core_UI_Module` mapping rules.

---

## 6. Testing Strategy

At minimum:

1. **No default map by default**
   - `getActiveMap` returns `null` for a new project.

2. **Set default map**
   - Setting a valid `mapId`:
     - Succeeds with `map.manage`.
     - `getActiveMap` then returns that map.

3. **Clear default map**
   - Calling `setActiveMap(projectId, null, ctx)`:
     - Clears the default map.
     - Subsequent `getActiveMap` returns `null`.

4. **Permissions**
   - Caller without `map.manage`:
     - Cannot change the default map (must get `AccessDeniedError`).
   - Caller without `map.read` for a particular map:
     - Cannot set that map as default.
     - `getActiveMap` behavior aligns with the chosen rule (recommended: returns `null`).

5. **Concurrency**
   - Simulate concurrent attempts to set different default maps:
     - Only one result is persisted.
     - Loser call(s) see a `ConcurrencyError` or a clear retryable error signal.
