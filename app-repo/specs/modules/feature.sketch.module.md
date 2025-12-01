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

### Permissions & Membership Integration (Implementation Notes)

- Sketch editing permissions are modeled in `core.permissions` via the
  `SKETCH_EDIT` PermissionAction, mapped to `"sketch.edit"` on `sketch`
  resources. Future actions such as `SKETCH_VIEW` may be introduced but
  follow the same pattern.
- All sketch APIs MUST delegate permission decisions to
  `core.permissions` using a **membership-aware `PermissionContext`**:
  - Read/view operations require at least project/feature-level read
    permissions (for example, `PROJECT_READ` or a future `SKETCH_VIEW`).
  - Any operation that mutates sketch state (creating sketches,
    editing geometry, annotations, or metadata) requires `SKETCH_EDIT`.
- The calling layer is responsible for constructing the
  membership-aware `PermissionContext` (via `ProjectMembershipService`
  and the current user), and then invoking `core.permissions` to
  evaluate whether the action is allowed based on project membership,
  global roles, or explicit overrides.
- When a sketch belongs to a project that does not match the
  membership context, `core.permissions` MUST treat it as
  `RESOURCE_NOT_IN_PROJECT`, and the sketch module must surface an
  appropriate access denied error.
