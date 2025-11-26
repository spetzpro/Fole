# Module Specification: feature.sketch

## Module ID
feature.sketch

## Related Specs

- `specs/core/_AI_UI_SYSTEM_SPEC.md` – defines the window, panel, and UI interaction model that embeds and hosts sketch tools and canvases.
- `specs/core/_AI_ROLES_AND_PERMISSIONS.md` – defines project-level and map-level permissions (e.g. `sketch.view`, `sketch.edit`) that guard sketch operations.
- `specs/ux/Project_Workspace_Experience.md` – describes how sketches participate in the project workspace layout, panels, and multi-window flows.

## Purpose
Manages vector-based sketch documents and layers attached to projects and maps, without assigning business semantics to shapes.

## State Shape
```ts
{
  sketches: {
    [sketchId: string]: {
      projectId: string;
      mapId?: string; // optional, for map-attached sketches
      name: string;
      layers: SketchLayer[];
      createdAt: string;
      createdBy: string;
      updatedAt: string;
      updatedBy: string;
    };
  };
}
```

## Blocks
- SketchRegistry: CRUD for sketch documents scoped to a project (and optionally a map).
- SketchLayerService: manage layers (order, visibility, locking).
- SketchShapeService: manage shapes within a layer (create/update/delete, z-order).
- SketchPermissionsBlock: ensures that only users with project/map edit permission can modify sketches.

## Lifecycle
- Creation: users create new sketches at project-level or attached to a specific map.
- Editing: shapes and layers are edited over time; updates are last-write-wins with optimistic concurrency at the document level.
- Archival: sketches can be soft-archived but remain queryable for audit/history until hard-deleted by admins.
- Migration: if sketch schema evolves, feature.sketch will migrate stored documents using core.storage patterns.

## Dependencies
- core.storage (ProjectModel, ProjectPathResolver, DAL)
- core.permissions (project-level and map-level guards)
- feature.map (for map-bound sketches, via mapId)
- core.auth (actor identity)

## Error Model
- SketchNotFoundError: invalid sketchId for the given project/map context.
- SketchPermissionError: caller lacks permission to read or modify the sketch.
- SketchConflictError: optimistic concurrency conflict for updates (version mismatch).
- SketchValidationError: invalid shape/layer payloads (e.g., too large, malformed).

## Test Matrix
- CRUD matrix: create/update/delete sketches and layers with proper permission checks and state validation.
- Map linkage: attempts to attach a sketch to a non-readable map must fail.
- Concurrency: concurrent updates with stale versions must produce SketchConflictError.
- Migration: when schema evolves, existing sketches are transparently upgraded on read or via a batch migration process.
