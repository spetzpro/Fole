# Module: core.exportImport

## Module ID
core.exportImport

## Inventory Mapping
- Inventory Name: core.exportImport
- Kind: Module
- Layer: core
- Status: In implementation

## Purpose
The `core.exportImport` module defines project-level export/import services. The MVP implementation exports a
project DB descriptor (including a minimal manifest) and imports by copying a project DB into the target
project directory. Permission enforcement is handled by secured wrappers.

## State Shape
```ts
{}
```

## Blocks
- core.block.projectExport: Build an export descriptor for a project DB snapshot.
- core.block.projectImport: Apply an import bundle to a target project directory.
- core.block.exportPermissions: Enforce `PROJECT_EXPORT` via core.permissions.
- core.block.importPermissions: Enforce ADMIN role for import.

## Public API (Operations)

### createProjectExportService
- Inputs:
  - projectDbRoot: string
  - projectId: string
- Outputs:
  - ProjectExportDescriptor ({ projectId, manifest, projectDbPath, filesPath? })
- Permissions:
  - None (use secured wrapper for enforcement)
- Underlying blocks:
  - core.block.projectExport

### createProjectImportService
- Inputs:
  - projectDbRoot: string
  - bundle: ProjectImportBundle ({ projectDbPath, filesPath?, manifest })
- Outputs:
  - { projectId: string }
- Permissions:
  - None (use secured wrapper for enforcement)
- Underlying blocks:
  - core.block.projectImport

### createSecuredProjectExportService
- Inputs:
  - base: ProjectExportService
  - membershipService: ProjectMembershipService
  - permissionService: PermissionService
- Outputs:
  - SecuredProjectExportService
- Permissions:
  - Requires `PROJECT_EXPORT` on the project resource via PermissionService.

### createSecuredProjectImportService
- Inputs:
  - base: ProjectImportService
  - permissionService: PermissionService
- Outputs:
  - SecuredProjectImportService
- Permissions:
  - Requires current user to have ADMIN role.

## Lifecycle
- No persisted state or migrations.
- Exports/imports operate on filesystem paths and project DB snapshots.

## Planned vs Implemented

- Planned:
  - Export full project bundle (files, templates, assets, module data) with checksums and manifest.
  - WAL-safe snapshotting and atomic export directory finalization.
  - Import validation (manifest checksums, version compatibility, conflict resolution).
  - Identity mapping for imported `project_members` rows.

- Implemented:
  - Export returns a minimal manifest and project DB path for a project.
  - Import copies `project.db` into the target project directory.
  - Secured export checks `PROJECT_EXPORT` and throws `PERMISSION_DENIED` on failure.
  - Secured import requires ADMIN role and throws `PERMISSION_DENIED` on failure.

## Dependencies
- Modules:
  - core.permissions.PermissionService
  - core.permissions.PermissionGuards (buildProjectPermissionContextForCurrentUser)
  - core.auth.CurrentUserProvider
  - core.storage.ProjectMembershipService
- System Specs:
  - specs/core/_AI_EXPORT_AND_IMPORT_SPEC.md
  - specs/core/_AI_STORAGE_ARCHITECTURE.md
  - specs/core/_AI_DB_AND_DATA_MODELS_SPEC.md
  - specs/core/_AI_ROLES_AND_PERMISSIONS.md
  - specs/core/_AI_TESTING_AND_VERIFICATION_SPEC.md

## Error Model
- Throws `Error` if source or target project DB paths are missing.
- Throws `AppError` with code `PERMISSION_DENIED` for failed permission checks.

## Test Matrix
- tests/core/projectExportImportService.test.ts
- tests/core/projectExportImportSecured.test.ts
