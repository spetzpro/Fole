# Module Specification: feature.measure

## Module ID
feature.measure

## Purpose
Offers measurement tools and saved measurement entities for distances, areas, and related metrics over maps and world coordinates.

## State Shape
```ts
{
  measurements: {
    [measurementId: string]: {
      projectId: string;
      mapId?: string;
      sketchId?: string;
      name?: string;
      type: 'distance' | 'polyline' | 'area' | 'angle';
      geometry: Geometry; // world or map-local coordinates depending on mode
      unit: string; // e.g., 'm', 'km', 'ft', 'sqm'
      lastComputedValue: number;
      createdAt: string;
      createdBy: string;
      updatedAt: string;
      updatedBy: string;
    };
  };
}
```

## Blocks
- MeasurementService: create, update, delete saved measurements.
- MeasurementQueryService: list and filter measurements for a project/map/sketch.
- MeasurementComputationService: call lib.geo to compute lengths/areas/angles from geometry.
- MeasurementPermissionsBlock: enforce read/edit permissions based on project and map roles.

## Lifecycle
- Creation: a user defines a geometry (polyline or polygon) in either map-local or world coordinates and requests a measurement.
- Computation: measurement values are (re)computed via lib.geo using the current calibration or coordinate system.
- Persistence: measurements store geometry and lastComputedValue; recalculation may be triggered when calibration changes.
- Migration: when geometry formats or supported measurement types evolve, stored measurements are migrated or lazily upgraded on read.

## Dependencies
- lib.geo (coordinate conversions and measurement calculations)
- feature.map (map metadata, calibration summary)
- feature.sketch (optional linkage to sketch geometries)
- core.permissions (derived rights for measurement resources)
- core.auth, core.storage

## Error Model
- MeasurementNotFoundError: invalid measurementId for the given project context.
- MeasurementPermissionError: actor lacks permission to see or modify measurements.
- MeasurementValidationError: invalid or unsupported geometry; inconsistent coordinate systems.
- MeasurementComputationError: failures from lib.geo (e.g., invalid calibration or degenerate shapes).

## Test Matrix
- Geometry correctness: valid geometries produce expected measurement values within tolerance defined by calibration.
- Calibration changes: when calibration for a map changes, measurements tied to it must be either flagged as stale or recomputed.
- Permissions: read-only roles can view but not modify measurements; edit roles can create/update/delete.
- Edge cases: zero-length and near-zero area shapes must be handled gracefully without crashes or infinite values.
