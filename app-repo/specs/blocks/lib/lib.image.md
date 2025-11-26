# Module Specification: lib.image

## Module ID
lib.image

## Related Specs

- `specs/core/_AI_FILE_AND_IMAGE_PIPELINE_SPEC.md` – authoritative rules for image normalization, color management, EXIF handling, and derived renditions.
- `specs/core/_AI_STORAGE_ARCHITECTURE.md` – defines storage roots, folder layout, and atomic write patterns used for image binaries and derivatives.
- `specs/core/_AI_AUTOMATION_ENGINE_SPEC.md` – defines job/automation semantics for any background image processing or tiling jobs.

## Purpose
Implements the image processing pipeline defined by _AI_FILE_AND_IMAGE_PIPELINE_SPEC.md for normalization, metadata handling, and derived assets.

## State Shape
```ts
{
  // lib.image is largely stateless at the module level; state is externalized in storage.
  jobs?: {
    // configuration for image processing jobs, if any
  };
}
```

## Blocks
- ImageNormalizationService: load images and normalize format, color space, and orientation.
- ImageMetadataService: extract and persist image metadata (dimensions, color profile, EXIF data).
- ThumbnailService: generate and manage thumbnails or preview renditions.
- ImagePipelineJobHandlers: job handlers for async image processing tasks (if orchestrated via lib.jobs).

## Lifecycle
- Synchronous flows: small images may be normalized and thumbnailed inline at upload.
- Asynchronous flows: larger or more complex images are processed via background jobs that read source binaries, write normalized outputs, and update metadata.
- Migration: whenever pipeline rules change (e.g., new thumbnail sizes), lib.image exposes helpers to backfill or regenerate derivatives.

## Dependencies
- core.storage (for locating and reading/writing image binaries)
- lib.jobs (for async processing)
- lib.diagnostics (for logging and metrics)
- feature.files and feature.map as primary callers

## Error Model
- ImageFormatError: unsupported or corrupt image inputs.
- ImageProcessingError: failures in normalization, thumbnail creation, or metadata extraction.
- ImageStorageError: failures reading from or writing to backing storage.
- ImageJobError: job-level failures with associated retry semantics defined in _AI_AUTOMATION_ENGINE_SPEC.md.

## Test Matrix
- Pipeline conformance: verify that every rule in _AI_FILE_AND_IMAGE_PIPELINE_SPEC.md has a corresponding behavior in lib.image.
- Caller contracts: ensure clear, documented contracts for what callers must provide (e.g., storageKey, desired rendition types) and what they get back.
- Job behavior: for async flows, ensure jobs are idempotent and safe to retry.
- Performance: basic throughput and latency checks for common operations, especially thumbnail generation.
