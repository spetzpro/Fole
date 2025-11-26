# Feature Map Calibration Service — Spec

**File:** `specs/modules/feature.map/feature.map.CalibrationService.md`  
**Module:** `feature.map`  
**Status:** Specced

---

## 1. Purpose

`FeatureMapCalibrationService` manages **calibration records** for maps.

It is responsible for:

- Creating and updating calibration records with control points and metadata.
- Managing which calibration is **active** for a map.
- Exposing calibration history per map.
- Supporting core geo transforms by providing the active calibration.

It does **not** implement low-level numeric math directly; that is delegated to `lib.geo` (see `_AI_GEO_AND_CALIBRATION_SPEC.md`).

---

## 2. Public API

```ts
interface FeatureMapCalibrationService {
  listCalibrations(
    projectId: ProjectId,
    mapId: MapId,
    ctx: PermissionContext
  ): Promise<MapCalibration[]>;

  getActiveCalibration(
    projectId: ProjectId,
    mapId: MapId,
    ctx: PermissionContext
  ): Promise<MapCalibration | null>;

  createCalibration(
    projectId: ProjectId,
    mapId: MapId,
    input: CreateCalibrationInput,
    ctx: PermissionContext
  ): Promise<MapCalibration>;

  updateCalibration(
    projectId: ProjectId,
    mapId: MapId,
    calibrationId: CalibrationId,
    input: UpdateCalibrationInput,
    ctx: PermissionContext
  ): Promise<MapCalibration>;

  setActiveCalibration(
    projectId: ProjectId,
    mapId: MapId,
    calibrationId: CalibrationId,
    ctx: PermissionContext
  ): Promise<MapCalibration>;
}
```

### 2.1 Types

Use the shared types from `FeatureMapTypes.ts`:

```ts
type CalibrationId = string;

type CalibrationTransformType =
  | "affine"
  | "projective"
  | "helmert"
  | "grid"
  | "custom";

type CalibrationControlPoint = {
  id: string;
  pixel: { x: number; y: number };
  world: WorldCoord;
};

type MapCalibration = {
  projectId: ProjectId;
  mapId: MapId;
  calibrationId: CalibrationId;
  isActive: boolean;
  transformType: CalibrationTransformType;
  controlPoints: CalibrationControlPoint[];
  errorRms?: number | null;
  createdAt: string;
  updatedAt: string;
};

type CreateCalibrationInput = {
  transformType: CalibrationTransformType;
  controlPoints: CalibrationControlPoint[];
};

type UpdateCalibrationInput = {
  transformType?: CalibrationTransformType;
  controlPoints?: CalibrationControlPoint[];
};
```

---

## 3. Semantics

### 3.1 Calibration history

- Multiple calibration records may exist per map.
- Each new calibration is a separate record; older ones are preserved for history and auditing.

### 3.2 Single active calibration per map

- At most **one calibration per map** may have `isActive = true` at any time.
- `getActiveCalibration`:
  - Returns the calibration with `isActive = true`, or `null` if none exists.

### 3.3 `listCalibrations`

- Returns all calibrations for `(projectId, mapId)`.
- Sorted from newest to oldest (typically by `createdAt` descending).
- Requires `map.calibrate` or `map.read` depending on whether calibration details are considered sensitive:
  - Recommended: require `map.calibrate` for full details, allow aggregated summary via `FeatureMapService` for `map.read`.

### 3.4 `createCalibration`

- Validates:
  - That `mapId` exists and caller has `map.calibrate`.
  - That `controlPoints` satisfy minimum requirements (e.g., at least 3 non-collinear points for some transform types).
- Creates a new calibration record with:
  - `isActive = false` (by default; activation done via `setActiveCalibration`).
  - `createdAt` and `updatedAt` set to current time.
- Optionally:
  - Triggers a background job to compute transform parameters and error metrics, depending on product phase.

### 3.5 `updateCalibration`

- Updates allowed fields of an existing calibration:
  - `transformType`, `controlPoints`.
- Must not change:
  - `projectId`, `mapId`, `calibrationId`, `createdAt`.
- Must update `updatedAt`.
- Must respect any constraints (e.g., if calibration is active and in use, changes may be restricted).

### 3.6 `setActiveCalibration`

- Ensures that the target calibration:
  - Exists.
  - Belongs to `(projectId, mapId)`.
- Requires `map.calibrate`.
- After completion:
  - Exactly one calibration for this map has `isActive = true`.
  - All others have `isActive = false`.
- Must be implemented as an atomic operation to avoid race conditions.

---

## 4. Permissions

- `listCalibrations` / `getActiveCalibration`:
  - Require `map.read` at minimum; may require `map.calibrate` depending on deployment rules.
- `createCalibration`, `updateCalibration`, `setActiveCalibration`:
  - Require `map.calibrate`.

---

## 5. Dependencies

- Storage:
  - Calibration table(s) in `project.db` as per `_AI_DB_AND_DATA_MODELS_SPEC.md`.
- `FeatureMapService`:
  - To validate that the map exists and is visible.
- `lib.geo`:
  - For numeric computation of transforms and error metrics (if synchronous).
  - Or jobs/automation engine for offloaded calculation.

---

## 6. Error Model

- `MapNotFoundError`
  - If target map does not exist.

- `CalibrationNotFoundError`
  - If target calibration does not exist for `(projectId, mapId)`.

- `AccessDeniedError`
  - If caller lacks required permissions.

- `CalibrationValidationError`
  - For invalid control points, unsupported transforms, etc.

- `ConcurrencyError`
  - For conflicting updates especially around `isActive`.

---

## 7. Testing Strategy

1. **Create and list**
   - Create multiple calibrations; verify `listCalibrations` ordering and contents.

2. **Single active calibration**
   - Use `setActiveCalibration` on different calibrations; verify only one is active.

3. **Permissions**
   - Ensure `map.calibrate` is required where specified.

4. **Update behavior**
   - Update allowed fields; verify immutable fields remain unchanged.

5. **Concurrency**
   - Simulate two callers trying to activate different calibrations; verify atomic behavior.
