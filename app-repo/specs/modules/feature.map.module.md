# feature.map module spec

**Module name:** feature.map  
**Layer:** feature  
**Status:** Specced  

**Consumes specs:**  
- _AI_STORAGE_ARCHITECTURE.md  
- _AI_DB_AND_DATA_MODELS_SPEC.md  
- _AI_GEO_AND_CALIBRATION_SPEC.md  
- _AI_FILE_AND_IMAGE_PIPELINE_SPEC.md  
- _AI_MODULE_SYSTEM_SPEC.md  
- _AI_ROLES_AND_PERMISSIONS.md  
- specs/blocks/feature.map.block.md  

**Collaborating modules/libs:**  
- core.storage (AtomicWriteService, StoragePaths, DB contexts)  
- core.permissions (permission checks, grantSource)  
- core.ui (workspace + viewport state integration)  
- lib.geo (coordinate + calibration math)  
- lib.image (map imagery normalization and handles)  

---

## 1. Responsibilities

The feature.map module provides:

1. Map registry for a project (list/create/update/archive maps).
2. Active map management (project-local active map state).
3. Map imagery handles (access to canonical map image via lib.image).
4. Calibration state access + pixel↔world conversion via lib.geo.
5. Viewport helpers for map-specific camera state.

It does not implement rendering, heavy image processing, or calibration fitting itself.

---

## 2. Public API (conceptual)

### 2.1 Map registry API

```ts
type MapId = string;
type ProjectId = string;

type MapType = "floorplan" | "site_plan" | "satellite" | "schematic" | "other";
type MapTag = string;
type MapStatus = "active" | "archived" | "draft";

interface MapMetadata {
  mapId: MapId;
  projectId: ProjectId;
  name: string;
  description?: string;
  mapType: MapType;
  tags: MapTag[];
  status: MapStatus;
  createdAt: string; // IsoTimestamp
  updatedAt: string; // IsoTimestamp
  isCalibrated: boolean;
  calibrationTransformType?: "similarity" | "affine" | "other";
  calibrationErrorRms?: number | null;
}

interface FeatureMapService {
  listMaps(projectId: ProjectId, options?: {
    status?: MapStatus[];
    types?: MapType[];
    tagsAny?: MapTag[];
    includeArchived?: boolean;
  }): Promise<MapMetadata[]>;

  getMap(projectId: ProjectId, mapId: MapId): Promise<MapMetadata | null>;
}

#### 2.1.1 `listMaps` semantics

- **Default filter**  
  - If `options` is omitted, `listMaps` returns all maps in the project whose `status` is `"active"` or `"draft"`.  
  - `"archived"` maps are **excluded by default**.

- **`includeArchived`**  
  - If `includeArchived === true` and no explicit `status` array is provided, `listMaps` returns maps with status in `{"active", "draft", "archived"}`.  
  - If `status` **is** provided, it takes precedence over `includeArchived`.

- **`status`**  
  - When `options.status` is provided, only maps with a status in that list are returned.  
  - This is the most specific control; use it for explicit status filtering.

- **`types`**  
  - When `options.types` is provided, only maps whose `mapType` is in that list are returned.

- **`tagsAny`**  
  - When `options.tagsAny` is provided, a map is included if it has **at least one** tag in common with `tagsAny`.  
  - Tag comparison is case-sensitive unless otherwise specified by `_AI_DB_AND_DATA_MODELS_SPEC.md`.

- **Permissions**  
  - Callers must have `map.read` for the project (or a broader permission that implies it, such as `PROJECT_READ` as defined in `_AI_ROLES_AND_PERMISSIONS.md`).  
  - Implementations may internally check both `PROJECT_READ` and `map.read` during an interim migration phase, but the long-term contract is expressed in terms of `map.read`.

#### 2.1.2 Write operation semantics (high level)

- **`createMap`**
  - Creates a new map in `maps` with:
    - A new `mapId` (stable, immutable).
    - `status = "draft"` or `"active"` as defined by implementation rules (must be documented in tests).
    - `createdAt` and `updatedAt` set to the current time.
  - Immutable fields after creation:
    - `mapId`, `projectId`, `createdAt`.
  - Requires `map.manage` for the project.

- **`updateMapMetadata`**
  - Allows updating:
    - `name`, `description`, `mapType` (if permitted by product rules), `tags`.
  - Must **not** change `projectId`, `mapId`, or `createdAt`.
  - Must update `updatedAt` on successful write.
  - Requires `map.manage`.

- **`updateMapStatus`**
  - Changes only the `status` field, according to allowed transitions, e.g.:
    - `draft → active`
    - `active → archived`
    - `archived → active` (if un-archive is supported)
  - The exact allowed transitions must be captured in tests.
  - Requires `map.manage`.

All write operations must use atomic write patterns defined in `Core_ModuleStateRepository` / `_AI_CONCURRENCY_AND_LOCKING_SPEC.md` and must enforce permissions before committing.
```

All writes go through AtomicWriteService and enforce permissions:

```ts
interface WriteContext {
  userId: string;
  correlationId?: string;
  // plus anything core.storage expects
}

interface CreateMapInput {
  projectId: ProjectId;
  name: string;
  description?: string;
  mapType: MapType;
  tags?: MapTag[];
}

interface UpdateMapMetadataInput {
  projectId: ProjectId;
  mapId: MapId;
  name?: string;
  description?: string;
  mapType?: MapType;
  tags?: MapTag[];
}

interface UpdateMapStatusInput {
  projectId: ProjectId;
  mapId: MapId;
  status: MapStatus;
}

interface FeatureMapService {
  createMap(input: CreateMapInput, ctx: WriteContext): Promise<MapMetadata>;
  updateMapMetadata(input: UpdateMapMetadataInput, ctx: WriteContext): Promise<MapMetadata>;
  updateMapStatus(input: UpdateMapStatusInput, ctx: WriteContext): Promise<MapMetadata>;
}
```

### 2.2 Active map state

```ts
interface ActiveMapState {
  projectId: ProjectId;
  activeMapId: MapId | null;
}

interface FeatureMapActiveService {
  getActiveMap(projectId: ProjectId): Promise<MapMetadata | null>;

  setActiveMap(projectId: ProjectId, mapId: MapId | null, ctx: WriteContext): Promise<void>;

  subscribeActiveMap(
    projectId: ProjectId,
    listener: (map: MapMetadata | null) => void
  ): () => void; // Unsubscribe
}
```

Active map is persisted (e.g., in project settings in project.db) and cached in memory.

### 2.3 Map imagery access

```ts
interface LibImageDescriptor {
  kind: string;
  // exact shape defined by lib.image
}

interface MapImageHandle {
  projectId: ProjectId;
  mapId: MapId;
  imageDescriptor: LibImageDescriptor;
  widthPx: number;
  heightPx: number;
}

interface FeatureMapImageService {
  getMapImage(projectId: ProjectId, mapId: MapId): Promise<MapImageHandle | null>;
}
```

Uses StoragePaths + lib.image under the hood.

### 2.4 Calibration access

```ts
type CalibrationId = string;
type CalibrationTransformType = "similarity" | "affine" | "other";

interface CalibrationControlPoint {
  pixel: { x: number; y: number };
  world: any; // lib.geo world coordinate type
  residualError?: number | null;
}

interface MapCalibration {
  calibrationId: CalibrationId;
  mapId: MapId;
  projectId: ProjectId;
  transformType: CalibrationTransformType;
  transform: any; // lib.geo GeoTransform type
  controlPoints: CalibrationControlPoint[];
  rmsError?: number | null;
  maxResidualError?: number | null;
  createdAt: string;
  createdByUserId: string;
  isActive: boolean;
}

interface FeatureMapCalibrationService {
  getActiveCalibration(projectId: ProjectId, mapId: MapId): Promise<MapCalibration | null>;
  listCalibrations(projectId: ProjectId, mapId: MapId): Promise<MapCalibration[]>;

  setActiveCalibration(
    projectId: ProjectId,
    mapId: MapId,
    calibrationId: CalibrationId,
    ctx: WriteContext
  ): Promise<void>;
}

interface WorldCoord {
  // defined by lib.geo (e.g., ENU or WGS84 + height)
}

interface FeatureMapGeoService {
  pixelToWorld(projectId: ProjectId, mapId: MapId, pixel: { x: number; y: number }): Promise<WorldCoord | null>;
  worldToPixel(projectId: ProjectId, mapId: MapId, world: WorldCoord): Promise<{ x: number; y: number } | null>;
}
```

All calibration records are stored in project.db; map.db may cache derived data.

### 2.5 Viewport helpers

```ts
interface MapViewport {
  mapId: MapId;
  centerPx: { x: number; y: number };
  zoom: number;
  rotationDeg: number;
}

interface FeatureMapViewportService {
  normalizeViewport(handle: MapImageHandle, viewport: MapViewport): MapViewport;

  pixelToNormalized(handle: MapImageHandle, pixel: { x: number; y: number }): { u: number; v: number };
  normalizedToPixel(handle: MapImageHandle, uv: { u: number; v: number }): { x: number; y: number };
}
```

---

## 3. Permissions

- map.read – required to list/get maps and read imagery/calibration.
- map.manage – required to change map metadata or status.
- map.calibrate – required to create new calibration versions and change the active calibration.

All public write APIs take a WriteContext; implementation must call core.permissions and respect grantSource (project_membership, global_permission, override_permission).

---

## 4. Storage & DB (high level)

In project.db:

- maps
- map_calibrations
- project_settings (or equivalent for activeMapId)

In filesystem:

- STORAGE_ROOT/projects/<projectId>/maps/<mapId>/map.db
- Imagery directories defined by lib.image + storage spec.

All mutations go through AtomicWriteService with clearly named operations (map_create, map_update_metadata, map_update_status, map_set_active, map_set_active_calibration).

---

## 5. Error handling & diagnostics

- Wrap low-level errors into domain errors for callers.  
- Emit diagnostic events for map list/open, image issues, calibration changes.

---

## 6. Testing strategy

- Registry tests (create/update/status) + permission checks.  
- Active map persistence tests.  
- Calibration list/active semantics tests (exactly one active).  
- Imagery + viewport helper tests.

---

## 7. AI usage guidelines

- Use listMaps/getMap to inspect maps.  
- Never bypass FeatureMapService to touch DB directly.  
- Check calibration state before suggesting geo-sensitive actions.  
- Check permissions before suggesting destructive operations.


Additional expectations:

- Permission tests:
  - Ensure `map.read`, `map.manage`, and `map.calibrate` are enforced where required.
- Concurrency tests:
  - Verify that concurrent updates to map registry and calibration state respect atomic write rules.
- Active map tests:
  - Ensure exactly one active map per project.
  - Ensure permission checks apply when setting and reading active map.
