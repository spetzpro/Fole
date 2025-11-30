# AI Guidance: File & Image Pipeline

File: `specs/core/_AI_FILE_AND_IMAGE_PIPELINE_SPEC.md`  
Scope: How the AI should think about the end-to-end file/image pipeline: uploads, normalization, tiling, storage, and how this integrates with workspace features.

---

## 1. Goals

The file and image pipeline must:

- Handle **user-supplied images** (floorplans, photos, scans) safely and predictably.
- Normalize images into a **canonical internal format** where possible.
- Support **zoomable map viewing** via tiles or multi-resolution images.
- Maintain **color correctness** and orientation.
- Be compatible with the storage architecture and geo/calibration system.

This document is conceptual; concrete behavior will be specified in feature and module specs such as:

- `feature.map.*`
- `feature.files.*`
- `lib.image.*`
- `core.storage.FileStorage`
- `core.storage.ProjectModel` (for map/file metadata)

### 1.5 Current Implementation Status (MVP in this repo)

As of the current `app-repo` codebase:

- There is **no implementation** of `lib.image` under `src/lib/**`; the image pipeline described here is **Specced-only**.
- There is **no `feature.files` implementation**; file management exists only as a design in `feature.files.module.md`.
- `feature.map` currently:
  - Treats map images as simple binary files stored under the project’s storage hierarchy, managed by `core.storage`.
  - Does **not** implement canonical normalization or tiling behavior yet.
  - Only reads calibration summary data from `map_calibrations` and does not coordinate with an image pipeline.
- `FileStorage` is implemented as a general-purpose IO helper (non-atomic by itself) and is used for basic file handling.

AI agents working **within this repo** must treat this document as a **target design** for future `lib.image` and `feature.files/feature.map` behavior; it does **not** describe code that exists today.

---

## 2. File Types and Scope (MVP)

MVP focus:

- Input types:
  - Common image formats: PNG, JPEG, TIFF (including large scans).
  - Possibly PDF (first page as a rendered image) – can be added later.
- Primary use case:
  - A single floorplan or map image per project (MVP).
- Other files:
  - Reference photos, documents – stored and previewed with a simpler path.

We will gradually generalize, but the core pipeline design assumes:

> “User uploads a floorplan-like image → we normalize → we store → we serve it as a zoomable map.”

---

## 3. Canonical Image Format & Normalization

The pipeline should convert images into a **canonical internal representation** suitable for:

- tiling
- zooming
- calibration
- consistent rendering

Guidelines:

- Choose a canonical working format that is:
  - lossless or visually stable (e.g. PNG, or a visually lossless TIFF/PNG pipeline).
  - widely supported by tooling.
- Always respect:
  - EXIF orientation (normalize pixels accordingly).
  - Color profiles (ICC), converting to a canonical working color space (e.g. sRGB) for display.

Normalization steps (conceptual):

1. **Decode** input image from its original format.
2. **Apply EXIF orientation** so the image pixels are in “upright” orientation.
3. **Handle color profiles**:
   - If an embedded ICC profile exists, convert to the canonical working space.
4. **Re-encode** (if necessary) into the canonical internal format to be used for tiling and storage.

Original file:

- May be preserved as a “raw upload” for future export if storage allows.
- Or we may choose to only keep the processed version (tradeoff decision, project-level).

---

## 4. Tiling and Multi-Resolution Representation

To support smooth zooming and panning in the workspace, the system should support a tiling or multi-resolution strategy for map images.

Conceptual options:

- Pyramidal tiling (e.g. similar to Deep Zoom / XYZ tiles).
- Multi-resolution single-file formats (less likely for web, more for internal processing).

MVP direction:

- For simplicity and compatibility, design around **2D image tiles**:
  - e.g. 256x256 or 512x512 tiles at multiple zoom levels.

Requirements:

- Tiles should be derived from the **normalized canonical image**, not the raw upload.
- Tile generation can be:
  - synchronous for small images,
  - asynchronous (background job) for large images.
- Tiles are stored under the project’s storage hierarchy, e.g.:

  ```text
  STORAGE_ROOT/projects/<projectId>/files/maps/<mapId>/tiles/z/x_y.png
  ```

Exact path layout may be implemented in:

- `lib.image.*` (tile generation helpers, future)
- `feature.map.*` (map-specific behavior)
- `FileStorage` (binary IO)

---

## 5. Integration with Storage

All file operations must go through:

- `core.storage.FileStorage` (for binary data / file paths)
- `core.storage.ProjectPathResolver` (for folder layout)

Map images:

- Should be referenced in DB (e.g. `maps` table) with:
  - `id`
  - `file_key` or `file_id` (to locate the normalized image)
  - width, height (normalized pixel dimensions)
  - possibly DPI or scale metadata for calibration.

Other files:

- Are stored and tracked similarly, but without the tiling/geo requirements.

Temporary data:

- Intermediate and partial outputs (e.g. partially generated tiles) are written to the project’s `tmp/` folder before being promoted into final locations.

---

## 6. Security & Safety Considerations

The pipeline should be robust against:

- Malicious files:
  - suspicious formats masquerading as images
  - extremely large resolution or file size
- Resource exhaustion:
  - memory usage when decoding large images
  - CPU and IO usage during tiling

Guidelines:

- Enforce:
  - maximum dimensions (e.g. reject images beyond some width/height).
  - maximum file sizes.
- Use safe decoders from reputable libraries.
- Consider a time/size guardrail for processing pipelines.

---

## 7. Relationship to Geo & Calibration

Geo/calibration is described in:

- `_AI_GEO_AND_CALIBRATION_SPEC.md`

The image pipeline must:

- Preserve stable pixel coordinates in the normalized image.
- Ensure that calibration data (mapping pixel → world coordinates) remains valid as long as the underlying normalized image is unchanged.
- When reprocessing or replacing a map image:
  - be clear about whether calibration remains valid or must be recomputed.

Map and calibration modules should always use:

- the normalized canonical image dimensions
- not the original input image dimensions

for all pixel-based calculations.

---

## 8. Future Directions

Future enhancements may include:

- PDF ingestion:
  - render page 1 or selected pages to canonical images.
- Vector-based floorplans:
  - process and rasterize into maps, while preserving vector data for other uses.
- More advanced color management for print workflows.
- Dedicated `feature.imagePipeline` and `lib.image` blocks with fine-grained modules.

This spec should be revisited as soon as we start designing and implementing the `lib.image` and `feature.files` pipelines.
