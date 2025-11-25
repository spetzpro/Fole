# feature.map block spec

**Status:** Specced  
**Block name:** feature.map  
**Related modules:**  
- feature.map (module) – map registry, active map state, map DB access  
- lib.geo – coordinate systems, calibration math  
- lib.image – image normalization, map imagery handling  
- core.storage – project + map DB layout, file storage  
- core.ui – workspace shell, panels, navigation  
- core.permissions – access control for maps and map actions  

---

## 1. Purpose & Scope

feature.map provides user-facing functionality around maps in a project:

- Browsing and selecting maps  
- Opening a map into the workspace  
- Displaying map imagery at various zoom levels  
- Managing map metadata  
- Representing calibration between image coords and global/world coords  
- Exposing APIs for other blocks (sketch, measure, comments) to work in map space

Non-goals: sketching, commenting, measuring, image editing, or GPS hardware integration.

---

## 2. Domain Concepts

### 2.1 Project  
Owns a set of maps. Authoritative project map registry metadata lives in project.db.

### 2.2 Map  
A spatial container with:

- mapId, projectId  
- name, description  
- mapType (small enum: floorplan/site_plan/satellite/schematic/other)  
- tags: string[]  
- status: active/archived/draft  
- timestamps  
- one canonical normalized image (handled by lib.image)  
- zero or more calibration versions (via lib.geo), with at most one active.

### 2.3 Map Image  
Canonical normalized asset handled by lib.image:

- Stored under STORAGE_ROOT/projects/<projectId>/maps/<mapId>/...  
- Internally may use tiles or pyramids, but logically “one image per map”.  
- Orientation normalized on ingestion (EXIF etc.), so canonical pixels are “upright”.

### 2.4 Calibration  
Delegated to lib.geo, but this block:

- Stores and exposes calibration records.  
- Supports at least a similarity transform (scale + rotation + translation).  
- May support affine transforms for advanced “stretching” use cases.  
- Tracks transformType, control points, and error metrics.  
- Treats one calibration per map as active at a time; old versions kept for history.

### 2.5 Active Map & Viewport  
Active map = currently opened map in the workspace.  
Viewport = camera state over that map:

- center in canonical pixel coordinates  
- zoom factor  
- rotationDeg (visual camera rotation, independent of calibration)

core.ui owns overall workspace layout; feature.map defines the map-specific pieces.

---

## 3. User Flows (High-Level)

### 3.1 Browse Maps  
- User opens a project.  
- Sees a list of maps (name, type, status, tags, calibration status).  
- Can filter by type/status/tags.  
- Can click to open a map.

### 3.2 Open Map  
- Loads map metadata and canonical image handle.  
- Loads calibration state (if any).  
- Switches workspace to a “Map Workspace” view.  
- Initializes viewport (default or last-used).

### 3.3 Switch Maps  
- Disposes previous map-specific state.  
- Loads new map data.  
- Keeps workspace layout (panels) but swaps the central content.

### 3.4 Calibration Awareness  
- Uncalibrated maps: fully viewable but geo-dependent tools disabled or clearly marked.  
- Calibrated maps: enable measurement and geo-aware tools.

---

## 4. Storage & Data Integration

- project.db holds:
  - maps registry table
  - map_calibrations table (authoritative calibration records)  
  - project settings including activeMapId
- map.db under STORAGE_ROOT/projects/<projectId>/maps/<mapId>/map.db may hold:
  - cached or feature-specific tables
- All mutating operations (create/rename/archive maps, change active map, change active calibration) go through AtomicWriteService.

---

## 5. Integration with Other Blocks

- feature.sketch:
  - Anchors sketches to mapId in pixel space.
  - Subscribes to active map + viewport updates.

- feature.measure:
  - Requires active calibration for real-world units.
  - Uses lib.geo + feature.map calibration to compute distances/areas.

- feature.comments / feature.files:
  - Anchor items to mapId (and optionally pixel coordinates).
  - Need access to map metadata and calibration presence.

- lib.geo:
  - Holds transform math + data structures.
  - feature.map stores/serves calibration records, lib.geo does calculations.

- lib.image:
  - Handles normalization, tiling, and imagery metadata.
  - feature.map only asks for canonical map image handles.

---

## 6. Permissions

- map.read – view maps and their calibration state.  
- map.manage – manage map metadata, visibility, and non-calibration settings.  
- map.calibrate – create new calibration versions and activate/replace the active calibration for any map in the project.

All feature.map actions must call core.permissions for enforcement.

---

## 7. Error Handling & Diagnostics

- Use global error model for user-facing errors.  
- Emit diagnostics for key operations:
  - map_list_requested / failed  
  - map_open_requested / failed  
  - map_image_missing  
  - map_calibration_missing / calibration_set_active / calibration_failed

---

## 8. Telemetry & Future Extensions

Design keeps room for:

- multi-map views  
- derived/variant maps per base map  
- time-aware maps  
- project-wide map analytics

feature.map should not hard-code “one map only” assumptions in the workspace; active map is a concept, but multi-map capabilities can be added later.
