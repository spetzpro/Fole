# Module Specification: feature.files

## Module ID
feature.files

## Related Specs

- `specs/core/_AI_FILE_AND_IMAGE_PIPELINE_SPEC.md` – defines canonical image normalization, EXIF and color-profile handling, and rules for map imagery tiling.
- `specs/core/_AI_STORAGE_ARCHITECTURE.md` – defines storage roots, folder layout, and atomic write patterns for file binaries and derived assets.
- `specs/core/_AI_DB_AND_DATA_MODELS_SPEC.md` – defines the project.db tables and columns used to persist file metadata and relationships.
- `specs/core/_AI_ROLES_AND_PERMISSIONS.md` – defines project-scoped permissions such as `files.read` and `files.manage` that guard file operations.

## Purpose
Provides a project-centric file library and attachment system, delegating binary storage to core.storage and image processing to lib.image.

## State Shape
```ts
{
  files: {
    [fileId: string]: {
      projectId: string;
      name: string;
      contentType: string;
      sizeBytes: number;
      storageKey: string; // path or key in underlying storage
      tags: string[];
      attachedTo?: {
        resourceType: string;
        resourceId: string;
      }[];
      createdAt: string;
      createdBy: string;
      updatedAt: string;
      updatedBy: string;
    };
  };
}
```

## Blocks
- FileLibraryService: upload, list, search, and soft-delete project files.
- FileAttachmentService: attach files to domain resources (maps, sketches, comments, measurements, etc.).
- FileMetadataService: manage tags and basic metadata updates.
- FilePermissionsBlock: enforce project-level file read/manage actions derived from core.permissions.

## Lifecycle

- Upload: files are uploaded via a controlled API, which allocates a storageKey using core.storage.FileStorage and records metadata in project.db.
- Use: domain features attach fileIds to their entities as needed (maps, sketches, comments, etc.).
- Retention: soft-delete hides files from normal queries but keeps metadata and binaries until a retention policy process (job) performs hard deletion.
- Migration: changes to file metadata schema are handled via project.db migrations and optional backfill jobs.


Image-specific flows:
- For uploads that are images participating in the map/image pipeline (e.g. floorplans), feature.files cooperates with lib.image and feature.map to trigger normalization and tiling behavior defined in `_AI_FILE_AND_IMAGE_PIPELINE_SPEC.md`. The concrete pipeline rules live in lib.image and the core specs; feature.files does not duplicate or override them.

## Dependencies
- core.storage (FileStorage, ProjectModel, DAL)
- core.permissions (files.read, files.manage derived from project roles)
- core.auth (actor identity)
- lib.image (for image-specific normalization and thumbnail generation)
- lib.jobs (for background cleanup or thumbnail generation jobs)

## Error Model
- FileNotFoundError: invalid fileId or file not visible in the caller’s context.
- FilePermissionError: insufficient privilege to read or manage files.
- FileTooLargeError: file exceeds configured project or system limits.
- FileValidationError: unsupported content type or invalid metadata.
- FileStorageError: underlying storage or network errors when writing/reading file binaries.

## Test Matrix
- Upload flows: valid uploads succeed and are visible in list/search, while unsupported types or oversized files fail with clear errors.
- Attachment flows: attaching to nonexistent or unauthorized resources fails, while valid attachments are queryable through the owning resource.
- Permissions: read-only roles can list/download but not delete or modify; manage roles can soft-delete and edit metadata.
- Background jobs: if thumbnail or cleanup jobs are configured, they must be enqueued and processed according to lib.jobs semantics.