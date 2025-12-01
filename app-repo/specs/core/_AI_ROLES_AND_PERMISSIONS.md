# AI Guidance: Roles & Permissions

File: `specs/core/_AI_ROLES_AND_PERMISSIONS.md`  
Scope: How the AI should think about roles, permissions, overrides, and how they connect to the core.permissions modules.

---

## 1. Goals

The permission system must:

- Be **flexible**: roles are configurable, not hard-coded forever.
- Be **transparent**: users (especially admin-type users) should always understand *why* they have access.
- Be **consistent**: the logic in code, specs, and UX behavior must align.
- Make override behavior **explicit and visible**, never accidental or “magic admin.”

This document describes the high-level model. Concrete types and APIs live in:

- `specs/modules/core.permissions/core.permissions.PermissionModel.md`
- `specs/modules/core.permissions/core.permissions.PolicyRegistry.md`
- `specs/modules/core.permissions/core.permissions.PermissionService.md`
- `specs/modules/core.permissions/core.permissions.PermissionGuards.md`

UX behavior for override visibility is detailed in:

- `specs/ux/Project_Workspace_Experience.md` (Admin Override section)

---

### 1.5 Current Implementation Status (Phase 1–2)

The model in this document describes the **target** roles/permissions system. The current implementation
in this repo has a completed Phase 1 slice and an incremental Phase 2 membership slice:

- `core.auth` exposes `CurrentUser` with `roles: string[]`.
- `core.permissions` implements the **engine** (PermissionModel, PolicyRegistry, PermissionService) and
  uses `PermissionContext` as described here.
-- `core.permissions.PermissionModel` defines a static canonical role → permission mapping
  (`CANONICAL_ROLE_PERMISSIONS`) and a helper (`deriveGlobalPermissionsForUser`) which derive
  `PermissionContext.globalPermissions` from `CurrentUser.roles`.
-- `core.permissions.PermissionGuards` use this mapping to build a `PermissionContext` from the current
  user for simple flows.
-- A minimal **per-project membership storage** now exists in `project.db` via the `project_members`
  table, with a `ProjectMembershipService` providing `getMembership` / `addOrUpdateMembership` /
  `removeMembership`.
-- `buildProjectPermissionContextForCurrentUser(projectId, membershipService)` combines `CurrentUser`,
  global permissions (from roles), and a `project_members` row (if present) to produce a
  membership-aware `PermissionContext.projectMembership`.
-- Feature-module permissions (Section 9) describe the default/target semantics. Today, `map.*`-related
  actions are implemented in the engine and exercised via `feature.map`'s map registry tests and a
  membership-enforced `createMap` flow; other feature module permissions are future work.

Tenant/dynamic configuration of roles and full project-membership-driven permissions (beyond the
current MVP membership storage and builder) remain planned and are not yet wired end-to-end.


## 2. Roles vs Permissions

### 2.1 Roles

Roles are **human-friendly bundles** of permissions. Examples:

- System roles: `SysAdmin`, `ProjectOwner`, `ProjectAdmin`, `Viewer`
- Custom roles: `FieldEngineer`, `QualityInspector`, etc.

Roles may exist at different scopes:

- **Global / system-level** roles (e.g. SysAdmin)
- **Project-level** roles (e.g. ProjectOwner, ProjectAdmin, Viewer on a specific project)

Internally, a role resolves to a set of **effective permissions**, which are strings like:

- `projects.read`
- `projects.write`
- `projects.manage`
- `files.read`
- `comments.create`
- `sketch.edit`

For maps and geo-calibration, project-level permissions include:

- `map.read` – view maps and their calibration state.
- `map.manage` – manage map metadata, visibility, and non-calibration settings.
- `map.calibrate` – create new calibration versions and activate or replace the
  active calibration for any map in the project. **Not** granted implicitly by
  `map.manage`.

There may also be special *override* permissions (see below):

- `projects.read.override`
- `projects.write.override`
- `projects.manage.override`

### 2.2 Permissions

A permission is the **atomic capability**. Examples:

- Read a project’s data
- Edit a sketch
- Delete a file
- Manage roles for a project

The core system uses a typed action model (`PermissionAction`) combined with a `ResourceDescriptor` for concrete checks:

- `PermissionAction` – a finite set of actions such as `PROJECT_READ`, `PROJECT_WRITE`, `PROJECT_EXPORT`, `FILE_READ`, `FILE_WRITE`, `COMMENT_CREATE`, `SKETCH_EDIT`, etc.
- `ResourceDescriptor` – describes the resource being accessed (project, file, sketch, comment, etc.).

The mapping from actions + resources to literal permission strings (e.g. `"projects.read"`) is an internal implementation detail of the policy layer.

`map.calibrate` is modeled as a normal permission string and participates in the
same evaluation pipeline as other project-scoped permissions.

---

## 3. Effective Permissions & Context

The system evaluates permissions using a `PermissionContext`, which combines:

- The **current user** (id, displayName, roles)
- **Global permissions** (from system roles, org settings, etc.)
- Optional **per-project membership** info, when relevant

Conceptually:

- User → has global roles → yields global permissions
- User + project membership → yields per-project permissions

Concrete shape (see `PermissionModel` spec for exact types):

- `PermissionContext.user` – current user (or null).
- `PermissionContext.globalPermissions: string[]` – e.g. `["projects.read.override", "projects.manage"]`.
- `PermissionContext.projectMembership` – if applicable:
  - `projectId`
  - `roleId` (e.g. `"OWNER"`, `"VIEWER"`, `"CUSTOM_FIELD_ENGINEER"`)
  - `permissions: string[]` – effective per-project permissions.

The permission system does **not** hard-code roles; it works off effective permissions. Roles are just one way to define those permissions.

> **Implementation note (MVP/Phase 2):** Some call sites (such as the current
> `PermissionGuards.createPermissionContextFromCurrentUser`) still construct a simplified `PermissionContext`
> directly from `CurrentUser`. For project-scoped flows, newer helpers such as
> `buildProjectPermissionContextForCurrentUser(projectId, membershipService)` now derive
> `projectMembership.permissions` from the canonical role→permission mapping and a `project_members`
> row in `project.db`. Over time, more call sites will be migrated to this pattern.


`map.calibrate` is a **project-scoped permission**:

- It applies to **all maps within a project**; it is not scoped to a single
  map instance.
- Read-only users with `map.read` may view calibration data and derived
  metadata but **may not** create, modify, or activate calibrations.
- `map.calibrate` is **not** implicitly granted by `map.manage` or by any other
  map-level permission; it must be included explicitly in a role or grant.

---

## 4. Override as a Permission (Not a Magic Role)

A key design decision:

> Override is modeled as a **permission**, not as a special hard-coded role.

That means:

- Being “an admin” is **not enough** by itself.
- A user needs explicit override permissions like:
  - `projects.read.override`
  - `projects.write.override`
  - `projects.manage.override`

These permissions may be granted by:

- System roles (e.g. `SysAdmin` → includes override perms)
- Custom admin-type roles
- Direct per-user assignment (less common, but possible)

The important part: **override is always explicit** and traceable.

---

## 5. Permission Decisions & Grant Source

Every permission check returns a `PermissionDecision` that includes:

- `allowed: boolean`
- `reasonCode?: PermissionDeniedReason`
- `grantSource?: GrantSource`

The `grantSource` field is crucial for admin/override transparency.

### 5.1 GrantSource

Possible values:

- `"project_membership"`  
  Access is granted via **normal project membership** permissions.
- `"global_permission"`  
  Access is granted via **global/system-level permissions** that are not override-specific.
- `"override_permission"`  
  Access is granted via **explicit override permissions**.

Example logic inside a policy handler (conceptually):

1. If the user has the needed permission in `projectMembership.permissions` →  
   `allowed = true`, `grantSource = "project_membership"`
2. Else if the user has a matching global permission (non-override) →  
   `allowed = true`, `grantSource = "global_permission"`
3. Else if the user has a matching override permission →  
   `allowed = true`, `grantSource = "override_permission"`
4. Else →  
   `allowed = false`, `reasonCode = "INSUFFICIENT_ROLE"` (or more specific)

This means the system always knows **how** access was granted.

When a module requests `map.calibrate`, the `core.permissions` engine must
evaluate the user’s project-level grants using the same unified `grantSource`
model (`"project_membership"`, `"global_permission"`, `"override_permission"`),
so that calibration-related access is fully auditable and visible in UX.

In the current MVP, project-level decisions for `MAP_EDIT` and `MAP_CALIBRATE`
can be driven by a membership-aware `PermissionContext` that uses
`project_members.role_id` (e.g. OWNER/EDITOR/VIEWER) to derive
`projectMembership.permissions` via `CANONICAL_ROLE_PERMISSIONS`. The
`feature.map` `createMap` flow is the first concrete example enforcing
`MAP_EDIT` this way.

---

## 6. Admin Override Visibility in UX

Admin-type users often have override permissions. It is critical they do **not** mistakenly believe:

- “I’m seeing this because the project owner added me”  
when in reality:
- “I’m seeing this because I have override permissions.”

The UX uses `PermissionDecision.grantSource` to make this visible.

### 6.1 Project List

For project-level read access:

- If `grantSource = "project_membership"`:
  - Show the project as “normal” access (Owner/Viewer/etc.).
- If `grantSource = "override_permission"` for a PROJECT_READ check:
  - Show a label such as “Admin Access” / “Override Access”.

### 6.2 Inside Workspace

When a user opens a project workspace via override:

- Header shows a badge, e.g. **“Admin Override Enabled”**.
- Tooltip explains:
  > “You are seeing this project because you have override permissions.”

### 6.3 Actions

When a user performs actions allowed via override permissions (delete, edit, manage):

- Buttons/controls may visually indicate override.
- Hover tooltip might say:
  > “This action is permitted because you have override permissions.”

The contract is:

- The **engine** sets `grantSource = "override_permission"` whenever override is used.
- The **UI** is responsible for rendering that fact clearly.
- Admin-type users should **always** know when they are overriding.

This matches what is described in:

- `specs/ux/Project_Workspace_Experience.md` (Admin Override section).

---

## 7. Connection to the `core.permissions` Modules

The high-level model in this file is implemented concretely by:

- `core.permissions.PermissionModel`
  - Defines `PermissionAction`, `ResourceDescriptor`, `PermissionContext`, `PermissionDecision`, `GrantSource`, etc.
- `core.permissions.PolicyRegistry`
  - Registers policy handlers for (action, resourceType) pairs.
- `core.permissions.PermissionService`
  - Looks up and executes the relevant policy, returns `PermissionDecision`.
- `core.permissions.PermissionGuards`
  - Convenience layer for services/UI (boolean checks, Result-returning guards, throwing guards).

AI agents working on permissions should:

1. Read this `_AI_ROLES_AND_PERMISSIONS.md` for the conceptual model.
2. Read `PermissionModel` for the concrete types.
3. Read `PolicyRegistry` + `PermissionService` for the wiring.
4. Read UX specs when implementing behaviors that should show override visibility.

---

## 8. Future Directions

- Add more fine-grained permission actions for future features (e.g. measurement tools, geo tasks, exports).
- Add a dedicated “Role/Permission Management” UI (later feature block).
- Add audit logging for override actions (especially destructive ones).

The core model here (permissions + grantSource + override as explicit permission) should remain stable even as new features and roles are introduced.


## 9. Feature Module Permissions (default / future semantics)
These sections describe the **default/target semantics** for feature modules such as
`feature.map`, `feature.files`, `feature.sketch`, `feature.comments`, and `feature.measure`.

In the current MVP implementation:

- Only the `map.*` actions are partially wired:
  - MAP_CALIBRATE policies exist in `core.permissions` and are tested.
  - `feature.map` uses PROJECT_READ and exposes calibration summary in read-only APIs; full map.manage
    and map.calibrate flows are not implemented yet.
- Other feature modules (files, sketch, comments, measurement) do **not** yet exist as runtime code in
  this repo; their permissions are forward-looking design and must be implemented later.

The semantics below should therefore be treated as **default/future behavior**, not as statements about
current code.


This section defines **default** permission semantics for feature modules. Concrete deployments MAY adjust mappings via policy configuration, but SHOULD keep the intent of each permission.

### 9.1 Resource type: `map` (feature.map)

The `feature.map` module introduces a concrete `map` resource type with three primary actions:

- `map.read`
- `map.manage`
- `map.calibrate`

These integrate with project-level permissions as follows.

#### 9.1.1 Actions

**`map.read`**

- **Intent:** Read-only access to a map and its basic metadata.
- **Allows:**
  - Calling `FeatureMapService.listMaps` and `FeatureMapService.getMap`.
  - Viewing map metadata (name, description, type, tags, status).
  - Seeing **calibration summary** fields surfaced on `MapMetadata`:
    - `isCalibrated`
    - `calibrationTransformType`
    - `calibrationErrorRms`
  - Resolving imagery handles for display (e.g. a `FeatureMapImageryService.resolveImageHandle` call).
  - Reading the project default map (e.g. `FeatureMapActiveService.getActiveMap`).
- **Does *not* allow:**
  - Creating, updating, or deleting maps.
  - Creating or modifying calibrations.

**`map.manage`**

- **Intent:** Manage map registry state and default map selection.
- **Allows:**
  - Creating maps.
  - Updating map metadata (display name, description, tags, type when allowed).
  - Changing map status (e.g. active ↔ archived) within the rules defined in the module spec.
  - Setting / clearing the project default map.
- **Requires:** `map.read` implicitly (anyone who can manage maps can also read them).

**`map.calibrate`**

- **Intent:** Manage calibration internals for a map.
- **Allows:**
  - Listing calibrations with full details (control points, transforms, error metrics).
  - Reading the active calibration with full control-point data.
  - Creating, updating, and activating calibrations.
- **Requires:** `map.read` implicitly.
- **Note:** Basic calibration *summary* stays available via `map.read` on `MapMetadata`; full control-point details require `map.calibrate`.

#### 9.1.2 Relationship to project-level permissions

Default relationships (unless overridden by policy configuration):

- `PROJECT_READ` **implies** `map.read` for all maps in that project.
- `PROJECT_EDIT` (or equivalent) **implies**:
  - `map.read`
  - `map.manage`
- `PROJECT_ADMIN` (or equivalent) **implies**:
  - `map.read`
  - `map.manage`
  - `map.calibrate`

All `map.*` actions are **project-scoped**. The `PermissionContext` for any map operation MUST include the current `projectId`.

---

### 9.2 Resource type: `file` (feature.files)

The `feature.files` module introduces a `file` resource type with two primary permission strings:

- `files.read`
- `files.manage`

These govern project-level file library behavior.

#### 9.2.1 Actions

**`files.read`**

- **Intent:** Read-only access to the project’s file library.
- **Allows:**
  - Listing files for a project (e.g. `FileLibraryService.listFiles`).
  - Reading file metadata (name, contentType, size, tags, attachment relationships).
  - Downloading file content via approved APIs when the caller also has access to the owning project/resource.
- **Does *not* allow:**
  - Uploading new files.
  - Editing metadata (name, tags, attachments).
  - Deleting or soft-deleting files.

**`files.manage`**

- **Intent:** Manage files and attachments within a project.
- **Allows:**
  - Uploading new files into the project library.
  - Editing file metadata (name, tags).
  - Attaching/detaching files to/from domain resources (maps, sketches, comments, etc.).
  - Soft-deleting files (subject to retention rules).
- **Requires:** `files.read` implicitly.

#### 9.2.2 Relationship to project-level permissions

Default relationships:

- `PROJECT_READ` **implies** `files.read` for that project.
- `PROJECT_EDIT` (or equivalent) **implies**:
  - `files.read`
  - `files.manage`
- `PROJECT_ADMIN` (or equivalent) **implies**:
  - `files.read`
  - `files.manage`

All `files.*` actions are **project-scoped** and must respect both project membership and the permissions of any resource a file is attached to.

---

### 9.3 Resource type: `sketch` (feature.sketch)

The `feature.sketch` module introduces a `sketch` resource type with permissions:

- `sketch.view`
- `sketch.edit`

#### 9.3.1 Actions

**`sketch.view`**

- **Intent:** View sketches attached to a project or map.
- **Allows:**
  - Listing sketches for a project/map.
  - Reading sketch structure (layers, shapes, styles).
- **Does *not* allow:**
  - Editing shapes, layers, or styles.

**`sketch.edit`**

- **Intent:** Create and edit sketches.
- **Allows:**
  - Creating and deleting sketches.
  - Editing shapes, layers, and styles.
- **Requires:** `sketch.view` implicitly.

#### 9.3.2 Relationship to project-level permissions

Default relationships:

- `PROJECT_READ` **implies** `sketch.view`.
- `PROJECT_EDIT` (or equivalent) **implies**:
  - `sketch.view`
  - `sketch.edit`
- `PROJECT_ADMIN` (or equivalent) **implies**:
  - `sketch.view`
  - `sketch.edit`

Sketch data is always project-scoped and, when attached to a map, also subject to `map.read` for that map.

---

### 9.4 Resource type: `comment` (feature.comments)

The `feature.comments` module manages comment threads attached to arbitrary resources. Permissions are:

- `comments.read`
- `comments.create`
- `comments.manage`

#### 9.4.1 Actions

**`comments.read`**

- **Intent:** Read comment threads and comments on resources the user can see.
- **Allows:**
  - Listing threads for a resource.
  - Reading comments in those threads.

**`comments.create`**

- **Intent:** Add new comments to threads.
- **Allows:**
  - Creating new threads (when allowed by policy).
  - Adding comments to existing threads.
- **Requires:** `comments.read` implicitly.

**`comments.manage`**

- **Intent:** Moderate comments.
- **Allows:**
  - Editing or soft-deleting comments (e.g. for moderation).
  - Locking or archiving threads.
- **Requires:** `comments.read` implicitly.

#### 9.4.2 Relationship to project-level permissions

Default relationships:

- `PROJECT_READ` **implies** `comments.read` for resources the user can already view.
- `PROJECT_EDIT` (or equivalent) **implies**:
  - `comments.read`
  - `comments.create`
- `PROJECT_ADMIN` (or equivalent) **implies**:
  - `comments.read`
  - `comments.create`
  - `comments.manage`

All comment operations are project-scoped and must also respect the underlying resource’s permissions (e.g. a user cannot comment on a map they cannot read).

---

### 9.5 Resource type: `measurement` (feature.measure)

The `feature.measure` module introduces a `measurement` resource type with:

- `measure.read`
- `measure.edit`

#### 9.5.1 Actions

**`measure.read`**

- **Intent:** View saved measurements and their computed values.
- **Allows:**
  - Listing measurements for a project/map/sketch.
  - Reading stored geometry and last computed value.

**`measure.edit`**

- **Intent:** Create and edit measurements.
- **Allows:**
  - Creating new measurements.
  - Editing or deleting existing measurements.
  - Triggering recomputation when calibration changes (indirectly via services).
- **Requires:** `measure.read` implicitly.

#### 9.5.2 Relationship to project-level permissions

Default relationships:

- `PROJECT_READ` **implies** `measure.read` for projects/maps the user can view.
- `PROJECT_EDIT` (or equivalent) **implies**:
  - `measure.read`
  - `measure.edit`
- `PROJECT_ADMIN` (or equivalent) **implies**:
  - `measure.read`
  - `measure.edit`

Measurement operations are project-scoped and must respect both map permissions (for map-anchored measurements) and any calibration rules defined in `_AI_GEO_AND_CALIBRATION_SPEC.md`.
