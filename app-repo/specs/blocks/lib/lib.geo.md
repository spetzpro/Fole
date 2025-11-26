# Module Specification: lib.geo

## Module ID
lib.geo

## Purpose
Implements the geo and calibration math from _AI_GEO_AND_CALIBRATION_SPEC.md for coordinate transforms and measurement calculations.

## State Shape
```ts
{
  // lib.geo maintains no long-lived state; operations are stateless given inputs.
}
```

## Blocks
- CoordinateTransformService: WGS84 ↔ ECEF ↔ local tangent plane conversions.
- CalibrationFittingService: compute map calibration transforms from control points.
- GeoMeasurementService: compute distances, areas, and angles from coordinates.
- GeoValidationService: validate control points and calibration inputs before fitting.

## Lifecycle
- Stateless operations: given inputs, lib.geo computes outputs deterministically without hidden state.
- Calibration lifecycle: higher-level modules (feature.map) own calibration entities; lib.geo only computes transforms and errors from provided control points.
- Versioning: functions evolved over time are versioned in code/API but not persisted as state within lib.geo itself.

## Dependencies
- feature.map (calibration and map/world coordinate transforms)
- feature.measure (measurement calculations)
- core.foundation/CoreTypes for shared math/precision types
- lib.diagnostics for logging and metrics in error or edge cases

## Error Model
- GeoInputValidationError: malformed or inconsistent input sets (e.g., too few control points, degenerate geometries).
- CalibrationFitError: inability to compute a stable transform with acceptable error.
- GeoComputationError: numeric failures or unsupported coordinate systems.
- GeoConfigError: misconfiguration of global geo parameters (e.g., Earth model constants), typically detected during startup.

## Test Matrix
- Reference cases: known coordinate pairs must round-trip correctly across transforms within tolerance from _AI_GEO_AND_CALIBRATION_SPEC.md.
- Calibration accuracy: calibration fit results must meet or report specified error thresholds.
- Stress tests: large input sets or edge-case geometries must not crash or hang.
- Backwards compatibility: changes to algorithms must be tested against representative stored data to avoid breaking existing maps and measurements.
