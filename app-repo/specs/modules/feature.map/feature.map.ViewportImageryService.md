# Module: feature.map.ViewportImageryService

## Module ID
feature.map.ViewportImageryService

## 1. Purpose

The `feature.map.ViewportImageryService` module is Specced to provide:

- **Viewport helpers** for map UI:
  - Normalizing/clamping viewports.
  - Converting between pixel and normalized coordinates.
- **Imagery resolution**:
  - Resolving `MapImageHandle` into concrete `MapImageDescriptor` values.

Currently, there is **no implementation** of these services; only types exist in `FeatureMapTypes`.

## 2. Planned Responsibilities

- Viewport helpers:

  ```ts
  normalizeViewport(vp: MapViewport): MapViewport;
  pixelToNormalized(vp: MapViewport, pixel: { x: number; y: number }): { x: number; y: number };
  normalizedToPixel(vp: MapViewport, norm: { x: number; y: number }): { x: number; y: number };
  ```

- Imagery resolver:

  ```ts
  resolveMapImageHandle(projectId: string, mapId: string, handle: MapImageHandle): Promise<Result<MapImageDescriptor>>;
  ```

- Behavior:

  - Clamps zoom and coordinates to defined ranges.
  - Ensures rotation is normalized (e.g. within 0–360 degrees).
  - Uses `lib.image` and core.storage to locate and describe imagery.

## 3. Status

- **Lifecycle status**: Specced
  - No implementation exists in `src/feature/map/**`.
  - No tests exist for viewport or imagery behavior.

## 4. Dependencies

- `FeatureMapTypes` for MapViewport, MapImageHandle, MapImageDescriptor.
- `lib.image` and `_AI_FILE_AND_IMAGE_PIPELINE_SPEC.md` for imagery semantics.
- `core.storage` for locating image files.

## 5. Future Testing Strategy

Once implemented, tests SHOULD:

- Verify viewport normalization and clamping logic.
- Verify pixel ↔ normalized conversions across different zoom levels.
- Verify imagery resolution for different handle types (project files, external URLs, tiled imagery).
