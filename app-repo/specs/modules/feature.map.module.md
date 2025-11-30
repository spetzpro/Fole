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

At present, only the **types and read-only registry APIs** are implemented (FeatureMapTypes + read-side FeatureMapService). Other services remain Specced-only.

## 2. Responsibilities

- Provide:
  - A map registry for listing and retrieving maps per project.
  - Calibration summary on maps.
- Plan for:
  - Active map per project.
  - Calibration lifecycle APIs.
  - Viewport helpers and imagery resolution.

## 3. Status

- **Block status**: Specced (see Block spec).
- **Module status**: Specced, with a partial implementation:
  - Implemented:
    - FeatureMapTypes (types).
    - Read-only FeatureMapService (list/get).
  - Specced-only:
    - ActiveMapService.
    - CalibrationService.
    - ViewportImageryService.

Any consumer relying on `feature.map` should treat only the list/get registry APIs as currently available; all write and management operations are planned.

## 4. Dependencies and Integration

- Reads from `core.storage` project DB schema (maps, map_calibrations).
- Enforces `PROJECT_READ` using `core.permissions` for now.
- Designed to align with `_AI_GEO_AND_CALIBRATION_SPEC.md` and `_AI_FILE_AND_IMAGE_PIPELINE_SPEC.md` as additional services are implemented.

## 5. Testing and Evolution

- Tests exist for the read-only registry slice.
- As new services are implemented, module specs for each submodule must be updated first, then implementation and tests, and finally the block/module status in inventories revisited.
