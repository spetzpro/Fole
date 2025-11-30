# Block: lib.image

## Block ID
lib.image

## 1. Purpose

The `lib.image` block implements the **image processing pipeline** described in `_AI_FILE_AND_IMAGE_PIPELINE_SPEC.md`.

It is responsible for:

- Image normalization (format, color space, orientation).
- Metadata extraction (dimensions, color profile, EXIF).
- Derived assets (thumbnails, previews, other renditions).
- (Planned) job handlers for async image processing via `lib.jobs`.

It is **Specced only** in this repo; implementations live conceptually here but are not yet present under `src/lib/**`.

## 2. Scope and Non-Scope

### In scope

- Normalizing uploaded images into a canonical internal format.
- Managing derived assets (thumbnails, previews).
- Extracting and storing image metadata.
- Providing hooks for job-based processing when needed.

### Out of scope

- UI-specific image presentation.
- File browser UI (that is `feature.files`).
- Persisting image metadata schema (the schema itself lives in DB/storage specs; lib.image just uses it).

## 3. Block Decomposition

`lib.image` is conceptually decomposed into:

| Module ID                                  | Responsibility                                         | Status  |
|--------------------------------------------|--------------------------------------------------------|---------|
| `lib.image.ImageNormalizationService`      | Normalize image format, color space, and orientation   | Specced |
| `lib.image.ImageMetadataService`           | Extract and persist image metadata                     | Specced |
| `lib.image.ThumbnailService`               | Generate/manage thumbnails and preview renditions      | Specced |
| `lib.image.ImagePipelineJobHandlers`       | Job handlers for async image processing                | Specced |

### Block lifecycle status: **Specced**

- No implementation exists under `src/lib/**` in this repo.
- Behavior is governed by `_AI_FILE_AND_IMAGE_PIPELINE_SPEC.md` and related core specs.

## 4. Responsibilities per Module (High-Level)

### 4.1 ImageNormalizationService (Specced)

- Reads source images from storage.
- Applies pipeline rules for:
  - Color management.
  - Format conversions (e.g., to a canonical internal format).
  - Orientation normalization using EXIF.

### 4.2 ImageMetadataService (Specced)

- Extracts metadata such as:
  - Dimensions.
  - Color profile.
  - EXIF fields.
- Persists metadata in a structured, queryable format.

### 4.3 ThumbnailService (Specced)

- Generates thumbnails and previews according to pipeline spec.
- Ensures idempotent, retryable generation.

### 4.4 ImagePipelineJobHandlers (Specced)

- Implements job handlers for asynchronous image processing:
  - Uses `lib.jobs` to enqueue and run image processing jobs.
- Follows job semantics defined in `_AI_AUTOMATION_ENGINE_SPEC.md`.

## 5. Dependencies

### Allowed dependencies

- `core.storage` for reading/writing image binaries and derivatives.
- `lib.jobs` for asynchronous processing (when available).
- `lib.diagnostics` for logging and metrics.

### Downstream dependents

- `feature.files` and `feature.map` as primary callers of image operations.

## 6. Testing and CI (Planned)

When implemented:

- Tests MUST assert pipeline conformance with `_AI_FILE_AND_IMAGE_PIPELINE_SPEC.md`.
- Job behavior must be idempotent and retry-safe.
- Performance tests should validate throughput and latency for common operations.

Specs and inventories must be updated as implementations materialize.
