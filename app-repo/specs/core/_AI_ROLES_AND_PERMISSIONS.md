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

- `PermissionAction` – a finite set of actions such as `PROJECT_READ`, `PROJECT_WRITE`, `FILE_READ`, `FILE_WRITE`, `COMMENT_CREATE`, `SKETCH_EDIT`, etc.
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


## Feature Map module permissions

### 1. Resource type: `map`

The `feature.map` module introduces a concrete `map` resource type with three primary actions:

- `map.read`
- `map.manage`
- `map.calibrate`

These integrate with the existing project-level permissions (e.g. `PROJECT_READ`, `PROJECT_EDIT`, `PROJECT_ADMIN`) as follows.

### 1.1 Actions

**`map.read`**

- **Intent:** Read-only access to a map and its basic metadata.
- **Allows:**
  - Calling `FeatureMapService.listMaps` and `FeatureMapService.getMap`.
  - Viewing map metadata (name, description, type, tags, status).
  - Seeing **calibration summary** fields surfaced on `MapMetadata`:
    - `isCalibrated`
    - `calibrationTransformType`
    - `calibrationErrorRms`
  - Resolving imagery handles for display (`FeatureMapImageryService.resolveImageHandle`).
  - Reading the project default map via `FeatureMapActiveService.getActiveMap`.
- **Does *not* allow:**
  - Creating, updating, or deleting maps.
  - Creating or modifying calibrations.

**`map.manage`**

- **Intent:** Manage map registry state and default map selection.
- **Allows:**
  - Creating maps (`FeatureMapService.createMap`).
  - Updating map metadata (`FeatureMapService.updateMapMetadata`).
  - Changing map status (`FeatureMapService.updateMapStatus`).
  - Setting / clearing the project default map (`FeatureMapActiveService.setActiveMap`).
- **Requires:** `map.read` implicitly (anyone who can manage maps can also read them).

**`map.calibrate`**

- **Intent:** Manage calibration internals for a map.
- **Allows:**
  - Listing calibrations with full details (`FeatureMapCalibrationService.listCalibrations`).
  - Reading the active calibration with full control-point data (`FeatureMapCalibrationService.getActiveCalibration`).
  - Creating, updating, and activating calibrations (`createCalibration`, `updateCalibration`, `setActiveCalibration`).
- **Requires:** `map.read` implicitly.
- **Note:** Basic calibration *summary* stays available via `map.read` on `MapMetadata`; full control-point details require `map.calibrate`.

### 1.2 Relationship to project-level permissions

The following default relationships apply unless overridden by deployment-specific policy configuration:

- `PROJECT_READ` **implies** `map.read` for all maps in that project.
- `PROJECT_EDIT` (or equivalent, if defined) **implies**:
  - `map.read`
  - `map.manage`
- `PROJECT_ADMIN` (or equivalent) **implies**:
  - `map.read`
  - `map.manage`
  - `map.calibrate`

Implementations may choose different project-level role names (e.g. `PROJECT_OWNER`, `PROJECT_MAINTAINER`) but SHOULD preserve these implication semantics.

### 1.3 Multi-tenant and cross-project behavior

- All `map.*` actions are **project-scoped**:
  - There is no global `map.read` that bypasses project boundary checks.
  - The `PermissionContext` for any `FeatureMap*Service` call MUST include the current `projectId` and actor identity.
- Cross-project operations (e.g. copying a map from Project A to Project B) MUST:
  - Re-check permissions independently for each project.
  - Never assume that `map.read` in one project implies anything in another.

### 1.4 UI / Core integration expectations

- Core UI and clients MUST:
  - Use `map.read` to decide if maps should be listed or displayed.
  - Use `map.manage` to decide if registry edit controls (create, rename, archive, set default) are visible.
  - Use `map.calibrate` to decide if calibration tooling UI should be enabled.
- When a caller lacks the necessary permission for an operation:
  - Backend SHOULD return a typed access error (e.g. `AccessDeniedError` with `code = "FORBIDDEN"`).
  - Core UI SHOULD map this to a user-friendly `UiError` that can be surfaced in dialogs, toasts, or inline messages.
