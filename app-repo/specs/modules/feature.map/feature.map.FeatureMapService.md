# Module: feature.map.FeatureMapService

## Module ID
feature.map.FeatureMapService

## 1. Purpose

The `feature.map.FeatureMapService` module provides the **map registry API** for reading map metadata and calibration summary per project.

It is responsible for:

- Listing maps for a project with filters (status, types, tags).
- Retrieving a single map's metadata.
- Exposing calibration summary fields per map (where available).
- Enforcing basic permissions on read operations.

At present, the service is **read-only**: all write methods are NotImplemented and should not be used in production flows.

## 2. Responsibilities and Non-Responsibilities

### Responsibilities (current MVP)

- Implement:

  ```ts
  listMaps(projectId: string, options?: {
    status?: "active" | "archived" | "draft" | "any";
    types?: string[];
    tagsAny?: string[];
    includeArchived?: boolean;
  }): Promise<Result<MapMetadata[]>>;

  getMap(projectId: string, mapId: string): Promise<Result<MapMetadata>>;
  ```

- Query `maps` and `map_calibrations` in project.db via core.storage.
- Map rows into `MapMetadata` with calibration summary fields:

  - `isCalibrated`
  - `calibrationTransformType`
  - `calibrationErrorRms`

- Enforce basic read permissions using `core.permissions` (MVP: ensure PROJECT_READ on the containing project).

### Planned responsibilities

- Implement:

  - `createMap(projectId, input, ctx: PermissionContext)`
  - `updateMapMetadata(projectId, mapId, input, ctx: PermissionContext)`
  - `updateMapStatus(projectId, mapId, status, ctx: PermissionContext)`

- Enforce:

  - `map.read` and `map.manage` actions via PermissionService.

- Use `AtomicWriteService` for all write operations:
  - Ensure concurrency-safe updates and clear error semantics.

### Non-Responsibilities

- Does **not** manage active/default map (ActiveMapService will).
- Does **not** manage the full calibration lifecycle (CalibrationService will).
- Does **not** handle viewport/image resolution (ViewportImageryService will).

## 3. Public API (MVP)

> Implementation lives in `src/feature/map/FeatureMapService.ts`.

### Read APIs

```ts
listMaps(projectId: string, options?: {
  status?: "active" | "archived" | "draft" | "any";
  types?: string[];
  tagsAny?: string[];
  includeArchived?: boolean;
}): Promise<Result<MapMetadata[]>>;

getMap(projectId: string, mapId: string): Promise<Result<MapMetadata>>;
```

Note: The current implementation obtains a `PermissionContext` via dependencies (e.g., a `getPermissionContext` function) and does not expose `ctx` as a parameter; this is an MVP design and may evolve.

### Write APIs (planned)

```ts
createMap(projectId: string, input: CreateMapInput, ctx: PermissionContext): Promise<Result<MapMetadata>>;
updateMapMetadata(projectId: string, mapId: string, input: UpdateMapMetadataInput, ctx: PermissionContext): Promise<Result<MapMetadata>>;
updateMapStatus(projectId: string, mapId: string, status: MapStatus, ctx: PermissionContext): Promise<Result<MapMetadata>>;
```

These are Specced-only and are currently **NotImplemented** in code.

## 4. Behavior and Current Implementation

- `listMaps`:
  - Performs a SQL SELECT over maps and map_calibrations for a given project.
  - Constructs `MapMetadata` instances from rows.
  - Applies in-memory filtering for options (status, types, tagsAny, includeArchived).

- Default archived behavior (current):
  - Tests assume `listMaps` returns all maps, including archived, unless options are provided.
  - Spec desires a default that excludes archived maps; this is a **planned adjustment**.

- `getMap`:
  - SELECTs a single map + calibration summary by mapId.
  - Returns a `MapMetadata` or a Result error if not found.

- Permissions (current):
  - Uses PROJECT_READ on the project via `core.permissions`.
  - Planned: enforce `map.read/map.manage` actions in addition.

- Writes:
  - `createMap`, `updateMapMetadata`, and `updateMapStatus` currently throw NotImplemented.
  - Tests explicitly assert this behavior.

## 5. Planned vs Implemented

### Current status

- **Lifecycle status**: Implemented (read-only slice)
  - Read APIs (list/get) are implemented and tested.
  - Write APIs are Specced but NotImplemented.

### Planned enhancements

- Align default archived behavior with spec (exclude archived maps unless requested).
- Implement write APIs using AtomicWriteService and concurrency/error model from DB and storage specs.
- Tighten permission enforcement to use `map.read`, `map.manage`, and `map.calibrate` where appropriate.

## 6. Dependencies

### Upstream dependencies

- `core.storage` for project DB paths and queries.
- `core.permissions` for permission checks.
- `FeatureMapTypes` for MapMetadata and related types.
- `core.foundation` for Result and AppError.

### Downstream dependents

- Map-related UI flows, once implemented.
- Calibration management services (when they use summary data).

## 7. Testing Strategy

Existing tests:

- `featureMapService.test.ts`:
  - Validates list/get behavior and calibration summary.
  - Validates filters for status/types/tagsAny.
  - Validates current default behavior with archived maps.
- `featureMapService.writes.test.ts`:
  - Confirms write methods are NotImplemented.

Future tests:

- When write APIs are implemented:
  - Use project DB fixtures and atomic write integration.
  - Test permission failure scenarios and concurrency errors.

## 8. CI / Governance Integration

Any change to:

- MapMetadata shape.
- DB queries for maps/calibration summary.
- Permission enforcement logic for read/write.

MUST:

1. Update this spec.
2. Update `FeatureMapService.ts`.
3. Update `featureMapService.test.ts` and write-related tests.
4. Keep the block spec and inventories aligned.
5. Ensure `npm run spec:check` passes.
