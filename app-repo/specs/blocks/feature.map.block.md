# Block: feature.map

## Block ID
feature.map

## 1. Purpose

The `feature.map` block provides **map-centric functionality** for the application:

- Map registry: listing and retrieving maps per project.
- Map workspace entry points (maps that can be opened for work).
- Calibration summary exposure and (in future) calibration lifecycle management.
- (Planned) active/default map per project.
- (Planned) viewport helpers and imagery resolution.

It acts as the **bridge** between core storage (map DB), geo/calibration logic (`lib.geo`), image pipeline (`lib.image`), and permissions (`core.permissions`).

At present, the **read-side map registry slice** and a minimal write
path for map creation are implemented. The rest of the responsibilities
are Specced only.

## 2. Scope and Non-Scope

### In scope

- Reading map metadata and calibration summary from project DB `maps` and `map_calibrations` tables.
- Exposing map lists and single-map metadata to other blocks.
- Enforcing basic permissions on map read operations.

### Planned

- Managing the **active/default map** per project.
- Full **calibration lifecycle** (create/update/list/activate calibration records per map).
- **Viewport helpers** and imagery resolution (normalized viewport, tile queries, integration with lib.image).
- Tight integration with `core.permissions` for `map.read`, `map.manage`, and `map.calibrate`.

### Out of scope

- Low-level DB schema definitions (owned by `_AI_DB_AND_DATA_MODELS_SPEC.md` and core.storage).
- Geo math (owned by `lib.geo` and `_AI_GEO_AND_CALIBRATION_SPEC.md`).
- Tile/image loading details (owned by `lib.image` and `_AI_FILE_AND_IMAGE_PIPELINE_SPEC.md`).
- UI presentation of maps (owned by `core.ui` and feature-specific UI code).

## 3. Block Decomposition

`feature.map` is decomposed into the following modules:

| Module ID                                  | Responsibility                                         | Status      |
|--------------------------------------------|--------------------------------------------------------|-------------|
| `feature.map.FeatureMapTypes`              | Shared map & calibration types                         | Implemented |
| `feature.map.FeatureMapService`            | Map registry (READ) + createMap write path             | Implemented |
| `feature.map.CalibrationService`           | Calibration records read APIs (list/getActive)         | Implemented |
| `feature.map.ActiveMapService`             | Default/active map per project                         | Specced     |
| `feature.map.ViewportImageryService`       | Viewport helpers and map imagery resolution            | Specced     |

### Block lifecycle status: **Implemented (read-biased slice with createMap)**

- Types, read-only registry slice, a read-only CalibrationService, and a
  minimal `createMap` write flow are implemented and covered by tests.
- Active/default map, calibration lifecycle **writes** (create/update/activate),
  viewport helpers, imagery resolution, and additional write flows for maps
  (`updateMapMetadata`, `updateMapStatus`) are **not yet implemented**.
- The block will be promoted toward Stable once those responsibilities are
  wired and tested.

Any new `feature.map.*` module must be added to this table and tracked in the inventories.

## 4. Responsibilities per Module (High-Level)

### 4.1 FeatureMapTypes (Implemented)

- Defines types for:
  - Map IDs/project IDs.
  - Map types/status/tags.
  - Map metadata (including calibration summary fields).
  - Calibration-related types (control points, transforms, calibration records).
  - Viewport types and image-handle descriptors.

Implementation exists in `src/feature/map/FeatureMapTypes.ts` and is used by FeatureMapService and tests.

### 4.2 FeatureMapService (Implemented, read-biased + createMap)

- Implements the **map registry read slice**:
  - `listMaps(projectId, options?)` → `MapMetadata[]`.
  - `getMap(projectId, mapId)` → `MapMetadata`.
- Implements a **Phase 1 write flow** for map creation:
  - `createMap(input)` → `MapMetadata` for the newly created map.
  - Persists a new row in `maps` within the project’s `project.db`.
  - Enforces `MAP_EDIT` on a `map` resource scoped to `projectId`, using a
    membership-aware `PermissionContext` constructed via
    `buildProjectPermissionContextForCurrentUser(projectId, ProjectMembershipService)`.
  - A user must be a member of the project with a suitable role
    (e.g. OWNER/EDITOR granting `map.edit`), or have appropriate global/override
    permissions, to successfully create a map.
- Reads from `maps` and `map_calibrations` in project.db via core.storage.
- Exposes calibration summary fields (isCalibrated, calibrationTransformType, calibrationErrorRms).
- Enforces basic permissions for read via `core.permissions` (MVP: PROJECT_READ).

Other write operations (`updateMapMetadata`, `updateMapStatus`) are currently
**NotImplemented**, and there is **no AtomicWriteService integration yet** for
map writes.

### 4.3 ActiveMapService (Specced-only)

- Planned responsibilities:
  - Manage an active/default map per project.
  - Provide `getActiveMap(projectId)` and `setActiveMap(projectId, mapId|null)` APIs.
  - Store default map ID in project.db (e.g. via project_settings table).
  - Enforce `map.read` / `map.manage` permissions.

There is currently **no implementation** for this module.

### 4.4 CalibrationService (Implemented, read-only)

- Implemented responsibilities (Phase 1):
  - List calibrations for a map from `map_calibrations` in project.db.
  - Return the active calibration for a map based on `is_active`.
  - Enforce the "single active calibration" rule at read time by selecting the active row.

- Planned responsibilities (future phases):
  - Create/update calibration records.
  - Set active calibration for a map.
  - Persist full transform parameters and control points (once `calibration_points` and related schema are in place).
  - Integrate with `lib.geo` to represent calibration transforms.

### 4.5 ViewportImageryService (Specced-only)

- Planned responsibilities:
  - Provide viewport math helpers:
    - Normalize/clamp viewport.
    - pixel↔normalized coordinate conversions.
  - Resolve `MapImageHandle` → `MapImageDescriptor`:
    - Integrate with `lib.image` and core.storage for image locations.

There is currently **no implementation** of these services; viewport types exist only in FeatureMapTypes.

## 5. Invariants and Guarantees (Current Slice)

- **Read-only registry**:
  - `listMaps` and `getMap`:
    - Use `projectId` and `mapId` to query `maps` and `map_calibrations`.
    - Return `MapMetadata` consistent with FeatureMapTypes.
- **Calibration summary**:
  - Only a single active calibration per map is exposed via summary fields.
  - Detailed calibration records and transforms are not managed at the feature layer yet.
- **Permissions (MVP + membership-backed MAP_EDIT)**:
  - Read operations use `PROJECT_READ` permission checks for project-scoped reads.
  - Map-level permission actions (`MAP_EDIT`, `MAP_CALIBRATE`) are defined in
    `core.permissions`.
  - `FeatureMapService.createMap` now enforces `MAP_EDIT` on a `map` resource,
    using a membership-aware `PermissionContext` built from the current user
    and `project_members` via `ProjectMembershipService`.

## 6. Dependencies

### Allowed dependencies

`feature.map` may depend on:

- `core.storage` for project DB access (maps, map_calibrations).
- `core.permissions` for permission checks (PROJECT_READ today; map.* actions later).
- `core.foundation` for logging, diagnostics, Result/AppError.
- `_AI_GEO_AND_CALIBRATION_SPEC.md` / `lib.geo` for calibration semantics (future).
- `_AI_FILE_AND_IMAGE_PIPELINE_SPEC.md` / `lib.image` for imagery semantics (future).

It MUST NOT depend on:

- UI components (`core.ui`).
- Feature modules unrelated to maps.

### Downstream dependents

- Map-related UI flows.
- Future map-related services (e.g., measure, comments anchored to maps).

## 7. Performance Considerations

Current implementation:

- `listMaps` executes a SQL SELECT over maps and map_calibrations and performs filtering in memory.
- `getMap` executes a single SQL SELECT by mapId.
- No image or heavy calibration math is executed yet.

As long as project map counts remain moderate, this is acceptable; heavy usage should lead to tighter SQL filters and pagination semantics in the future.

## 8. Testing Strategy

Existing tests:

- `tests/feature/map/featureMapService.test.ts`:
  - Validates list/get behavior and calibration summary fields.
  - Validates filtering by status, types, and tags.
- `tests/feature/map/featureMapService.writes.test.ts`:
  - Asserts that write methods currently throw NotImplemented, documenting their unimplemented status.

Future tests:

- For ActiveMapService, CalibrationService, Viewport/Imagery services when implemented.
- More detailed permission tests tying together FeatureMapService and `core.permissions` policies (including MAP_CALIBRATE).

## 9. CI and Governance Integration

Any change to:

- Map metadata shape.
- DB usage patterns (maps/map_calibrations queries).
- Permission enforcement logic.

MUST:

1. Update this block spec.
2. Update the relevant module spec(s).
3. Update implementation and tests.
4. Keep `Blocks_Modules_Inventory.md` and `specs/inventory/inventory.json` in sync.
5. Ensure `npm run spec:check` passes from the repo root.
