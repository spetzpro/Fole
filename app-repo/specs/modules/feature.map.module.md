# Module: feature.map

## Module ID
feature.map

## 1. Purpose

The `feature.map` module spec describes the **overall contract** for map-related functionality:

- Map registry APIs.
- Active/default map.
- Calibration lifecycle.
- Viewport helpers and imagery resolution.

This module spec is split across several submodule specs:

- `feature.map.FeatureMapService`
- `feature.map.ActiveMapService`
- `feature.map.CalibrationService`
- `feature.map.ViewportImageryService`

At present, the **types, read-only registry APIs, a minimal createMap write
flow, and a read-only CalibrationService** are implemented (FeatureMapTypes +
FeatureMapService + CalibrationService). Other services remain Specced-only.

## 2. Responsibilities

- Provide:
  - A map registry for listing and retrieving maps per project.
  - Calibration summary on maps.
- Plan for:
  - Active map per project.
  - Calibration lifecycle APIs.
  - Viewport helpers and imagery resolution.

## 3. Status

- **Block status**: Implemented (read-biased slice with createMap; see Block spec).
- **Module status**: Specced, with a partial implementation:
  - Implemented:
    - FeatureMapTypes (types).
    - FeatureMapService:
      - Read APIs: list/get with calibration summary from `map_calibrations`.
      - Write API: `createMap`, which persists a new map row in `maps` and
        enforces `MAP_EDIT` using a membership-aware `PermissionContext` built
        by `buildProjectPermissionContextForCurrentUser(projectId, ProjectMembershipService)`.
    - Read-only CalibrationService (listCalibrations/getActiveCalibration from `map_calibrations`).
  - Specced-only:
    - ActiveMapService.
    - ViewportImageryService.

Any consumer relying on `feature.map` should treat only the list/get registry APIs as currently available; all write and management operations are planned.

## 4. Dependencies and Integration

- Reads from `core.storage` project DB schema (maps, map_calibrations).
- Writes new map rows into `maps` for `createMap`.
- Enforces permissions via `core.permissions`:
  - Read APIs (`listMaps`, `getMap`, read-only calibration queries) MUST
    require `PROJECT_READ` on the owning project.
  - Map write APIs (`createMap` today, and future update/delete operations)
    MUST enforce `MAP_EDIT` (and `PROJECT_WRITE` where appropriate) on map
    and/or project resources.
  - Calibration lifecycle APIs (when implemented) MUST enforce
    `MAP_CALIBRATE`.
- Implementations MUST construct a membership-aware `PermissionContext`
  (e.g. via `buildProjectPermissionContextForCurrentUser(projectId, ProjectMembershipService)`)
  and pass it to `core.permissions` `PermissionService` / `PermissionGuards`
  for all permission checks.
- Designed to align with `_AI_GEO_AND_CALIBRATION_SPEC.md` and `_AI_FILE_AND_IMAGE_PIPELINE_SPEC.md` as additional services are implemented.

## 5. Testing and Evolution

- Tests exist for:
  - The read-only registry slice (list/get and calibration summaries).
  - The `createMap` write flow, including membership-enforced `MAP_EDIT` permissions via
    `core.permissions`.
- As new services are implemented, module specs for each submodule must be updated first, then implementation and tests, and finally the block/module status in inventories revisited.
