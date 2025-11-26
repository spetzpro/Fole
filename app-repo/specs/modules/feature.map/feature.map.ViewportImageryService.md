# Feature Map Viewport & Imagery Service — Spec

**File:** `specs/modules/feature.map/feature.map.ViewportImageryService.md`  
**Module:** `feature.map`  
**Status:** Specced

---

## 1. Purpose

This spec covers simple backend services for:

- **Viewport helpers** — normalize and convert viewports and coordinates.
- **Imagery resolution** — resolving `MapImageHandle` into a concrete image reference.

The heavy lifting for image tiling, pipelines, and rendering remains in dedicated image/tile pipeline modules.

---

## 2. Viewport Helpers

```ts
interface FeatureMapViewportService {
  normalizeViewport(
    map: MapMetadata,
    viewport: MapViewport
  ): MapViewport;

  pixelToNormalized(
    map: MapMetadata,
    pixel: { x: number; y: number }
  ): { u: number; v: number };

  normalizedToPixel(
    map: MapMetadata,
    uv: { u: number; v: number }
  ): { x: number; y: number };
}
```

### 2.1 Types

```ts
type MapViewport = {
  centerPx: { x: number; y: number };
  zoom: number;         // dimensionless, module-defined scale
  rotationDeg: number;  // degrees, clockwise
};
```

### 2.2 Semantics

- `normalizeViewport`:
  - Clamps `centerPx` to the valid image pixel bounds for the map.
  - Clamps `zoom` into `[minZoom, maxZoom]` as defined by module configuration.
  - Normalizes `rotationDeg` into a standard range, e.g. `[0, 360)`.

- `pixelToNormalized`:
  - Maps image pixel coordinates `{ x, y }` into `{ u, v }` with both components in `[0, 1]`.
  - Example: `{ x: 0, y: 0 }` → `{ u: 0, v: 0 }`; `{ x: width, y: height }` → `{ u: 1, v: 1 }`.

- `normalizedToPixel`:
  - Inverse of `pixelToNormalized`, within rounding error.
  - Must be pure (no side effects).

These helpers are pure functions and do not touch storage or permissions.

---

## 3. Imagery Resolution

```ts
interface FeatureMapImageryService {
  resolveImageHandle(
    projectId: ProjectId,
    mapId: MapId,
    ctx: PermissionContext
  ): Promise<MapImageDescriptor | null>;
}
```

### 3.1 Types

```ts
type MapImageHandle = {
  kind: "project-storage" | "library" | "external-url";
  id: string;
};

type MapImageDescriptor = {
  handle: MapImageHandle;
  // Resolved readonly info
  pixelWidth: number;
  pixelHeight: number;
  // Concrete storage reference (path, URL, or library ID)
  storageRef: string;
};
```

### 3.2 Semantics

- `resolveImageHandle`:
  - Reads `map.imageHandle` (if present) from the map record.
  - Resolves it to a concrete `MapImageDescriptor` using:
    - Project storage (for `project-storage`).
    - Image library (for `library`).
    - Validation for `external-url`.
  - Returns `null` if:
    - No `imageHandle` is registered for the map, or
    - The caller lacks `map.read`.

- Permissions:
  - Requires `map.read`.

- Storage:
  - Uses existing storage abstractions and/or image library APIs to resolve the handle.
  - Does not create or modify imagery data.

---

## 4. Dependencies

- `FeatureMapService`:
  - To obtain `MapMetadata` and `imageHandle`.
- Image library / pipeline modules:
  - For reading image metadata (size) and resolving storage references.
- Core permissions:
  - For `PermissionContext` and `map.read`.

---

## 5. Error Model

- `AccessDeniedError`
  - When caller lacks `map.read`.

- `MapNotFoundError`
  - When map does not exist for `(projectId, mapId)`.

- `ImageryResolutionError`
  - Unexpected failure resolving imagery metadata or storage reference.

All errors must map cleanly to `UiError`.

---

## 6. Testing Strategy

1. **Viewport helpers**
   - Normalization clamping for center/zoom/rotation.
   - Pixel ↔ normalized round-trip.

2. **Imagery resolution**
   - Map with project-storage handle.
   - Map with library handle.
   - Map with no handle → `null`.
   - Permission denied behavior.
