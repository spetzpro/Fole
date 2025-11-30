# Module: feature.map.CalibrationService

## Module ID
feature.map.CalibrationService

## 1. Purpose

The `feature.map.CalibrationService` module is Specced to manage the **calibration lifecycle** for maps.

It is responsible for (once implemented):

- Storing and retrieving calibration records for a map.
- Allowing creation and update of calibration records.
- Selecting a single active calibration per map.
- Integrating with `lib.geo` for transform semantics.
- Enforcing `map.calibrate` (and possibly `map.read`) permissions.

Currently, there is **no dedicated implementation** of this module.

## 2. Planned Responsibilities

- APIs such as:

  ```ts
  listCalibrations(projectId: string, mapId: string, ctx: PermissionContext): Promise<Result<MapCalibration[]>>;
  createCalibration(projectId: string, mapId: string, input: CreateCalibrationInput, ctx: PermissionContext): Promise<Result<MapCalibration>>;
  updateCalibration(projectId: string, mapId: string, calibrationId: string, input: UpdateCalibrationInput, ctx: PermissionContext): Promise<Result<MapCalibration>>;
  setActiveCalibration(projectId: string, mapId: string, calibrationId: string, ctx: PermissionContext): Promise<Result<MapCalibration>>;
  ```

- Behavior:

  - Ensure only one active calibration per map.
  - Use AtomicWriteService for operations that change active calibration.
  - Validate calibration data against `lib.geo` constraints.

## 3. Current Slice

- Today, calibration is exposed only as **summary fields** in `MapMetadata` via `FeatureMapService`:
  - `isCalibrated`
  - `calibrationTransformType`
  - `calibrationErrorRms`

- There is no CRUD or full history management; map_calibrations table is read but not managed at the feature layer.

## 4. Status

- **Lifecycle status**: Specced
  - No CalibrationService implementation.
  - No calibration lifecycle tests at the feature level.

## 5. Dependencies

- `core.storage` for map_calibrations table.
- `lib.geo` and `_AI_GEO_AND_CALIBRATION_SPEC.md` for transform semantics.
- `core.permissions` for `map.calibrate` enforcement.

## 6. Future Testing Strategy

Once implemented, tests SHOULD:

- Verify list/create/update/activate flows.
- Validate single-active-calibration invariant per map.
- Exercise permission enforcement (MAP_CALIBRATE) in positive and negative cases.
