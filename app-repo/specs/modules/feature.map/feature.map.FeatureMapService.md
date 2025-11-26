# Feature Map Service — Spec

**File:** `specs/modules/feature.map/feature.map.FeatureMapService.md`  
**Module:** `feature.map`  
**Status:** Specced

---

## 1. Purpose

`FeatureMapService` is the primary backend API surface for the **map registry** within a project.

It is responsible for:

- Managing **map metadata** in the project (name, type, description, tags, status).
- Providing **filtered listings** of maps for a project.
- Enforcing **permissions** for map read/manage operations.
- Respecting **atomic write** and **concurrency** rules defined by the core specs.

It does **not**:

- Handle calibration records (delegated to `FeatureMapCalibrationService`).
- Handle active-map selection (delegated to `FeatureMapActiveService`).
- Handle imagery storage or tiling (delegated to imagery/geo pipeline modules).

This spec refines the `FeatureMapService` definition in `specs/modules/feature.map.module.md` and connects it to concrete state, permissions, and test expectations.

---

## 2. Public API

```ts
interface FeatureMapService {
  listMaps(
    projectId: ProjectId,
    options?: {
      status?: MapStatus[];          // e.g. ["active", "draft"]
      types?: MapType[];
      tagsAny?: MapTag[];
      includeArchived?: boolean;
    },
    ctx: PermissionContext
  ): Promise<MapMetadata[]>;

  getMap(
    projectId: ProjectId,
    mapId: MapId,
    ctx: PermissionContext
  ): Promise<MapMetadata | null>;

  createMap(
    projectId: ProjectId,
    input: CreateMapInput,
    ctx: PermissionContext
  ): Promise<MapMetadata>;

  updateMapMetadata(
    projectId: ProjectId,
    mapId: MapId,
    input: UpdateMapMetadataInput,
    ctx: PermissionContext
  ): Promise<MapMetadata>;

  updateMapStatus(
    projectId: ProjectId,
    mapId: MapId,
    newStatus: MapStatus,
    ctx: PermissionContext
  ): Promise<MapMetadata>;
}
```

### 2.1 Types

```ts
type MapStatus = "draft" | "active" | "archived";

type MapType = "floorplan" | "site" | "satellite" | "custom";

type MapTag = string;

type MapId = string;
type ProjectId = string;

type CreateMapInput = {
  name: string;
  description?: string;
  mapType: MapType;
  tags?: MapTag[];

  // Optional initial status; if omitted, defaults to "draft" or "active"
  initialStatus?: MapStatus;

  // Optional external handle(s)
  imageHandle?: MapImageHandle;
};

type UpdateMapMetadataInput = {
  name?: string;
  description?: string;
  mapType?: MapType;
  tags?: MapTag[];
};

type MapMetadata = {
  projectId: ProjectId;
  mapId: MapId;
  name: string;
  description?: string;
  mapType: MapType;
  tags: MapTag[];
  status: MapStatus;
  createdAt: string;
  updatedAt: string;

  // Calibration summary
  isCalibrated: boolean;
  calibrationTransformType?: CalibrationTransformType;
  calibrationErrorRms?: number | null;

  // Optional imagery summary
  imageHandle?: MapImageHandle | null;
};
```

`MapMetadata` matches the types defined in `FeatureMapTypes.ts` (see module spec).

---

## 3. Semantics

### 3.1 `listMaps`

Key rules (as defined in the module spec, reiterated here for implementers and tests):

- **Default filter**
  - If `options` is omitted, `listMaps` returns maps whose `status` is `"active"` or `"draft"`.
  - `"archived"` maps are **excluded by default**.

- **`includeArchived`**
  - If `includeArchived === true` and no explicit `status` is provided, returned statuses are `{"active", "draft", "archived"}`.
  - If `status` **is** provided, it takes precedence over `includeArchived`.

- **`status`**
  - When `options.status` is provided, only maps whose `status` is in that list are returned.

- **`types`**
  - When `options.types` is provided, only maps whose `mapType` is in that list are returned.

- **`tagsAny`**
  - When `options.tagsAny` is provided, a map is included if it has at least one tag in common with `tagsAny`.
  - Tag matching is case-sensitive unless `_AI_DB_AND_DATA_MODELS_SPEC.md` defines otherwise.

- **Permissions**
  - Callers must have `map.read` for the project (or a broader permission that implies it, such as `PROJECT_READ`).
  - In early phases, implementations may internally check both `PROJECT_READ` and `map.read`, but the contract here is expressed in terms of `map.read`.

- **Calibration summary**
  - `isCalibrated`, `calibrationTransformType`, `calibrationErrorRms` are derived from the **active calibration** for each map (or default values if none exists).
  - This calls into `FeatureMapCalibrationService` or queries `map_calibrations` following the DB model.

### 3.2 `getMap`

- Returns `MapMetadata` for the specified map, or `null` if:
  - The map does not exist for that project, or
  - The caller lacks `map.read`.

- Must apply the same calibration summary logic as `listMaps`.

### 3.3 `createMap`

- Generates a new `mapId`.
- Inserts a row into the `maps` table in `project.db` with:
  - `projectId`, `mapId`, `name`, `description`, `mapType`, `tags`, `status`, `createdAt`, `updatedAt`.
  - `status`:
    - If `initialStatus` is provided, must be in `{ "draft", "active" }`.
    - If omitted, default is `"draft"` (unless the product decides to default to `"active"`, which must then be reflected in tests).
- Immutable fields after creation:
  - `mapId`, `projectId`, `createdAt`.

- **Permissions**
  - Requires `map.manage`.

- **Concurrency / atomicity**
  - Uses an atomic write pattern (single transaction) via core storage/concurrency.
  - Example concurrency concerns (e.g. duplicate names) should be handled either by constraints or pre-checks.

### 3.4 `updateMapMetadata`

- Allows updating:
  - `name`, `description`, `mapType` (if allowed), `tags`.
- Must not change:
  - `projectId`, `mapId`, `createdAt`.
- Must update `updatedAt` to the current time.
- Must preserve any invariant defined in the module spec (e.g., if some `mapType` transitions are disallowed).

**Permissions**

- Requires `map.manage`.

**Concurrency / atomicity**

- Uses atomic write with a version check or transaction to avoid lost updates.
- On concurrency conflict, surfaces a domain error (e.g., `ModuleStateConcurrencyError` or equivalent) which must be mapped to `UiError` by Core UI.

### 3.5 `updateMapStatus`

- Changes only `status`, according to allowed transitions (documented in code/tests).
  - Typical transitions:
    - `draft → active`
    - `active → archived`
    - `archived → active` (if un-archiving is supported).
- Must not modify other fields besides `status` and `updatedAt`.

**Permissions**

- Requires `map.manage`.

**Concurrency / atomicity**

- Same as `updateMapMetadata`: atomic, with concurrency-aware error handling.

---

## 4. Dependencies

- `core.moduleStateRepository` / storage layer
- `core.accessControl` / `core.permissions` (for `PermissionContext`, `map.read`, `map.manage`)
- DB tables for maps (e.g. `maps`, `map_calibrations`) as defined in `_AI_DB_AND_DATA_MODELS_SPEC.md`
- `FeatureMapCalibrationService` for summary (optional but recommended, instead of direct table joins)

---

## 5. Error Model

- `ForbiddenError` / `AccessDeniedError`
  - When caller lacks `map.read` / `map.manage`.
- `MapNotFoundError`
  - Thrown when update operations target a map that does not exist.
- `ConcurrencyError`
  - Thrown when concurrency control detects a conflicting update.
- `ValidationError`
  - Thrown when inputs are invalid (e.g. unsupported `mapType`, invalid status transition).

Errors must be mappable to:

- Domain error codes, and
- `UiError` via `Core_UI_Module` mapping.

---

## 6. Testing Strategy

At minimum:

1. `listMaps`:
   - Default behavior (no options).
   - `includeArchived` behavior.
   - `status`, `types`, `tagsAny` combinations.
   - Permission denied behavior.

2. `getMap`:
   - Existing map, non-existing map, permission denied.

3. `createMap`:
   - Happy path with full input.
   - Missing optional fields.
   - Permission denied.
   - Duplicate/conflicting constraints (if any).

4. `updateMapMetadata`:
   - Update allowed fields; immutable fields remain unchanged.
   - Permission denied.
   - Concurrent update conflict.

5. `updateMapStatus`:
   - Allowed transitions.
   - Disallowed transitions (must fail with a clear error).
   - Permission denied.
