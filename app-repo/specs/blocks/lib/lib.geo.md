# Block: lib.geo

## Block ID
lib.geo

## 1. Purpose

The `lib.geo` block provides **geospatial and calibration math** used across the system.

It is responsible for:

- Coordinate transforms between global and local coordinate systems.
- Map calibration fitting from control points.
- Geometric measurements (distances, areas, angles).
- Validation of calibration inputs and numeric safety.

It implements (conceptually) the math and rules defined in `_AI_GEO_AND_CALIBRATION_SPEC.md`.

Currently, `lib.geo` is **Specced only**: there is no implementation under `src/lib/**` in this repo.

## 2. Scope and Non-Scope

### In scope

- Stateless, deterministic computations for:
  - WGS84 ↔ ECEF ↔ local tangent plane conversions.
  - Calibration transforms fitting for maps.
  - Geo measurements on coordinates (distances, areas, angles).
  - Validation of control points and calibration inputs.

### Out of scope

- Persisting calibration entities (owned by `feature.map`).
- UI-level projection controls or visualization.
- DB schema definitions for geo data.

## 3. Block Decomposition

`lib.geo` is conceptually decomposed into:

| Module ID                             | Responsibility                                       | Status  |
|---------------------------------------|------------------------------------------------------|---------|
| `lib.geo.CoordinateTransformService`  | Coordinate transforms between reference frames       | Specced |
| `lib.geo.CalibrationFittingService`   | Compute calibration transforms from control points   | Specced |
| `lib.geo.GeoMeasurementService`       | Distances, areas, angles                             | Specced |
| `lib.geo.GeoValidationService`        | Validate control points and calibration inputs       | Specced |

### Block lifecycle status: **Specced**

- All modules are conceptual only.
- No code or tests exist under `src/lib/**` in this repo.

## 4. Responsibilities per Module (High-Level)

### 4.1 CoordinateTransformService (Specced)

- Implements WGS84 ↔ ECEF ↔ local tangent plane transforms.
- Ensures numeric stability and tolerances as per `_AI_GEO_AND_CALIBRATION_SPEC.md`.

### 4.2 CalibrationFittingService (Specced)

- Fits calibration transforms (e.g., similarity, affine, projective) from control points.
- Reports RMS errors and fit diagnostics.

### 4.3 GeoMeasurementService (Specced)

- Computes distances, areas, and angles over geo coordinates.
- Handles Earth curvature as specified in the core geo spec.

### 4.4 GeoValidationService (Specced)

- Validates that control point sets are sufficient and non-degenerate.
- Reports validation errors when calibrations cannot be safely computed.

## 5. Dependencies

### Allowed dependencies

`lib.geo` may depend on:

- `core.foundation.CoreTypes` for representing errors/results.
- Mathematical primitives or libraries.

It MUST NOT depend on:

- `feature.map` or `feature.measure` directly; instead, they depend on lib.geo.

### Downstream dependents

- `feature.map` (calibration and map/world coordinate transforms).
- `feature.measure` (distance/area/angle calculations).
- Any other module needing geo math.

## 6. Testing and CI (Planned)

When implemented, tests MUST:

- Include reference cases from `_AI_GEO_AND_CALIBRATION_SPEC.md`.
- Cover calibration accuracy thresholds and error reporting.
- Include stress tests and backward compatibility tests for changes in algorithms.

Specs and inventories must be updated as implementations stabilize.
