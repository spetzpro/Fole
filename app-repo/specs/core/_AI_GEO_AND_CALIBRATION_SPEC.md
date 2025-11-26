# AI Guidance: Geo & Calibration

File: `specs/core/_AI_GEO_AND_CALIBRATION_SPEC.md`  
Scope: How the AI should think about coordinates, calibration, and mapping between world space and image/map space.

---

## 1. Goals

The geo and calibration system must:

- Support **global positioning** (Earth scale) where needed.
- Support **local project coordinate systems** for maps and measurements.
- Allow mapping between:
  - world coordinates (e.g. WGS84-based)
  - local coordinates (e.g. ENU/local tangent plane)
  - pixel coordinates (map image)
- Be **invertible** and **numerically stable** for typical building/site scales.
- Integrate with storage, map, and measurement features.

This document is conceptual; concrete implementations will live in:

- `lib.geo.*` (future) – coordinate math, projections, transforms
- `feature.map.*` (future) – map UI and calibration tools
- `core.storage.ProjectModel` – persistent representation of calibration data

---

## 1.5 Implementation Modules and Responsibilities

This spec defines the **policy and mathematical rules** for coordinate systems and calibration. The concrete implementation is split across a few modules:

- `lib.geo` (library module)
  - Implements the core geo and calibration math:
    - WGS84, ECEF, and local tangent plane (ENU) conversions
    - pixel ↔ local/world transforms
    - calibration transform fitting from control points
    - distance/area/angle computations
  - Exposes stateless functions/services that operate on inputs provided by feature modules.
  - Does **not** own persistent entities; it only computes results.

- `feature.map` (feature module)
  - Owns **map entities**, calibration records, and control points in `project.db`.
  - Calls `lib.geo` to:
    - compute calibration transforms and error metrics
    - project between pixel and local/world coordinates for maps.
  - Ensures that only one calibration per map is active at a time, and that historical calibrations remain for audit and rollback.

- `feature.measure` (feature module)
  - Uses `lib.geo` to compute distances, areas, and related metrics from stored geometries.
  - Stores measurement entities that may be anchored to maps and/or local/world coordinates.
  - Does **not** implement its own coordinate math; it relies on `lib.geo` and the calibration data owned by `feature.map`.

The **behavioral rules live here** (in this `_AI_GEO_AND_CALIBRATION_SPEC.md` document).  
The module specs (`lib.geo.md`, `feature.map.module.md`, `feature.measure.module.md`) describe how each module applies these rules in its own context. This `_AI_*` spec remains the authoritative source of behavior when there is any disagreement.


## 2. Coordinate Systems Overview

We conceptually use:

1. **Global geodetic coordinates (WGS84)**  
   - Latitude, longitude, height.
2. **Earth-Centered, Earth-Fixed (ECEF)**  
   - Cartesian 3D representation tied to the Earth.
3. **Local project coordinates (local ENU / tangent plane)**  
   - A 2D or 3D local coordinate system anchored near the project.
4. **Map pixel coordinates**  
   - Coordinates in the normalized map image (x, y in pixels).

Mapping chain (conceptually):

- WGS84 ↔ ECEF ↔ Local (ENU) ↔ Pixel

Not every project will use all levels; some may only use local + pixel.

---

## 3. Local Project Coordinate System

Each project may define a **local coordinate system**:

- Origin chosen near the site (e.g. a known point on the ground).
- Axes:
  - x → east, y → north, z → up (standard ENU), or a similar convention.
- Units:
  - meters (recommended).

The project’s local frame is stored in project-level metadata (e.g. in `project.db` and/or `project.json`), including:

- reference geodetic point (lat, lon, h)
- orientation of axes
- any additional local reference info

If the project never uses global coordinates, the local frame may still exist purely as a convenient geometric basis for measurements.

---

## 4. Map Pixel Coordinate System

Each map (floorplan image) defines its own pixel coordinate system:

- (0, 0) at top-left of the **normalized** image.
- x increases to the right.
- y increases downward.
- Pixel dimensions:
  - width, height (stored with the map).

All map-based operations (sketch, comments, measurements, calibration) refer to:

- the normalized image pixels (post-orientation, post-normalization per the image pipeline spec).

---

## 5. Calibration: Pixel ↔ Local World

Calibration ties a map’s pixel coordinates to the project’s local coordinate system.

MVP approach:

- Each map stores one or more **calibration sets**, each consisting of:
  - a small set of **control points**:
    - `(pixel_x, pixel_y)` in image space
    - `(local_x, local_y, [local_z])` in project local coordinates
- From these points, we derive a transform:

  - simplest case: 2D similarity transform (scale + rotation + translation)
  - more advanced: affine or higher-order transforms if necessary (later)

Requirements:

- Transform must be:
  - forward: pixel → local
  - inverse: local → pixel
- Transform parameters are stored in a stable, well-defined form:
  - e.g. matrix coefficients, scale/rotation/translation, etc.

Storage:

- Calibration metadata is stored in `project.db` under tables like:
  - `calibration_sets`
  - `calibration_points`
- The exact schema will be defined as we spec `feature.map` and `lib.geo`.

### 5.1 Calibration Versioning

Calibration must be explicitly versioned so that changes are auditable and reversible:

- Calibration records are stored in a dedicated table (e.g. `map_calibrations`).
- Each row represents one **calibration version** for a given map.
- Exactly **one** calibration per map may be marked `isActive = true` at any time.
- Older calibration versions **must not** be deleted; they remain stored for:
  - audit and traceability
  - rollback / comparison
- Switching to a new calibration version updates the `isActive` flag but does **not**
  rewrite or discard historical versions.

### 5.2 Transform Types & Minimum Control Points

The calibration engine supports a small, explicit set of transform types:

- `transformType ∈ { "similarity", "affine", "projective" (future) }`.
- **Similarity** transforms (scale + rotation + translation) require **≥ 2** well-separated
  control points; degenerate configurations must be rejected.
- **Affine** transforms require **≥ 3** control points; **4+** well-distributed points are
  recommended for robustness.
- Future **projective** support may require additional points and validation rules.
- For every calibration fit, the system must record basic quality metrics:
  - RMS (root mean square) residual error across control points.
  - Maximum residual error across control points.

These metrics are stored alongside the transform parameters for diagnostics and tooling
in `feature.map`, `lib.geo`, and `feature.measure`.

---

## 6. Global Coordinates (Optional for MVP, but Supported)

Some projects may need to tie the site to real-world coordinates:

- For that, we use WGS84 (lat, lon, height) as the **global base**.
- Conversion to/from ECEF and then to/from local ENU is handled in `lib.geo`.

Typical flow:

1. Pick an anchor point:  
   - WGS84 (lat0, lon0, h0) for a known point on the site.
2. Define local ENU frame:
   - origin at that anchor.
3. All site coordinates (local_x, local_y, local_z) are expressed relative to that local frame.
4. Conversion to global WGS84 is done *via* ECEF + ENU math when needed.

This allows:

- optionally georeferencing the project for external systems
- showing approximate lat/lon when useful (not necessarily exposed in UI for safety)
- keeping the internal system local and precise.

---

## 7. Integration with Workspace & Features

Map workspace behavior (see `Project_Workspace_Experience.md`):

- When the user views a map, they interact in **pixel space**.
- Calibration is applied when:
  - measuring distances/areas (convert pixel → local)
  - exporting geo-referenced data
  - synchronizing multiple maps for the same project.

### 7.1 Pixel Coordinates as Canonical Annotation Space

To keep annotations stable across calibration changes:

- All user-created content anchored to a map stores its positions in **canonical pixel
  space**, including:
  - sketches and drawing primitives
  - comments and markers
  - measurements
  - files or other entities anchored to coordinates.
- Recalibrating a map must **never** move, warp, or otherwise rewrite annotation
  geometry in storage.
- When calibration is updated, only the **pixel → world** (and world → pixel) mapping
  changes; annotation records continue to refer to the same pixel coordinates.

Sketches and comments:

- Store their anchoring in pixel space (with references to map + optional calibration).
- When needed, they can be projected into local/world coordinates using the same transforms.

### 7.2 Viewport Rotation vs Calibration Rotation

The visual viewport and the calibration transform must remain clearly separated:

- Calibration rotation is intrinsic to the **pixel → world** transform and is part of the
  stored calibration parameters.
- Viewport rotation is a **purely visual** concern (e.g. rotating the map view for the
  user) and must be implemented independently of calibration.
- Viewport rotation must **not** modify, replace, or silently rewrite calibration
  parameters.
- Any UI-level rotation or flipping is applied on top of the calibrated pixel space
  without changing the underlying calibration records.

---

## 8. Storage & Data Flow

Calibration data is part of the project’s persisted state:

- It lives in `project.db` (tables owned by a `feature.geo` or similar future block).
- Map records hold:
  - a reference to one or more calibration sets
  - image dimensions
- The calibration engine uses:
  - the stored parameters
  - the known image dimensions
  - local frame metadata

The image pipeline must:

- Preserve image dimensions and pixel geometry of the normalized map.
- Ensure that replacing or reprocessing the normalized image is coordinated with calibration (either preserved or explicitly invalidated).

### 8.1 Calibration Permissions

Calibration operations have dedicated permissions separate from general map management:

- `map.calibrate` is a distinct permission from `map.manage`.
- Only principals with `map.calibrate` may:
  - create new calibration versions
  - activate or replace the active calibration for a map.
- `map.manage` may cover other map-level operations (naming, visibility, metadata)
  but does **not** implicitly grant calibration rights.
- Read-only access (`map.read`) always includes the ability to read calibration
  state and derived metadata needed to interpret map content.

---

## 9. Future Directions

Future enhancements may include:

- Multi-map calibration:
  - alignment of several maps within the same project.
- Cross-project alignment:
  - multiple projects sharing a common global frame.
- 3D calibration and height modeling.
- Integration with external GIS data.

This spec should be revisited when designing `lib.geo` and `feature.map` module specs.
