# Module: core.permissions.PermissionModel

## 1. Purpose

Define the core types used by the permissions system:

- roles and role identifiers
- actions and resource descriptors
- permission evaluation context
- permission decisions, including how access was granted (normal vs override)

This model is intentionally generic so that a flexible, highly customizable permission system can be built on top of it.

## 2. Types

~~~ts
// Canonical role archetypes the system is designed around.
// Your actual role system can be more flexible and map to these.
export type CanonicalRole = "OWNER" | "EDITOR" | "VIEWER" | "ADMIN";

// Actual role identifiers (can be arbitrary strings if needed).
export type RoleId = string;

// Actions that can be checked by the permission system (MVP set).
export type PermissionAction =
  | "PROJECT_READ"
  | "PROJECT_WRITE"
  | "FILE_READ"
  | "FILE_WRITE"
  | "COMMENT_CREATE"
  | "COMMENT_EDIT"
  | "COMMENT_DELETE"
  | "SKETCH_EDIT"
  | "MAP_EDIT";

// Resource types the system understands.
export type ResourceType = "project" | "file" | "comment" | "sketch" | "map";

// Generic descriptor for the resource being checked.
// `projectId` and `ownerId` are optional and used when relevant.
export interface ResourceDescriptor {
  type: ResourceType;
  id: string;
  projectId?: string;
  ownerId?: string;
}

// Why access was granted (when allowed).
// This is critical for distinguishing normal access from override behavior.
export type GrantSource =
  | "project_membership"   // user was added to the project / normal role path
  | "global_permission"    // system/org-level permission not tied to a specific project
  | "override_permission"; // explicit override capability (admin-type behavior)

// Per-project membership context, if the user is a member of this project.
export interface ProjectMembershipContext {
  projectId: string;
  roleId: RoleId;        // e.g. "OWNER", "CUSTOM_FIELD_ENGINEER"
  permissions: string[]; // effective per-project permissions (e.g. "projects.read", "sketch.edit")
}

// Current user shape comes from core.auth.CurrentUserProvider.
// Duplicated here as a minimal structural reference.
export interface CurrentUser {
  id: string;
  displayName: string;
  email?: string;
  roles: string[];
}

// Context for a single permission evaluation.
// Contains the user and their effective permissions.
export interface PermissionContext {
  user: CurrentUser | null;

  // Global/system-level effective permissions (from roles, org config, etc.).
  // Examples: "projects.read.override", "projects.manage".
  globalPermissions: string[];

  // Optional per-project membership, when the check is project-specific.
  projectMembership?: ProjectMembershipContext;
}

// Reasons why a permission check might be denied.
export type PermissionDeniedReason =
  | "NOT_AUTHENTICATED"
  | "INSUFFICIENT_ROLE"
  | "NOT_OWNER"
  | "RESOURCE_NOT_IN_PROJECT"
  | "UNKNOWN";

// Result of a permission check.
export interface PermissionDecision {
  // Whether the action is allowed.
  allowed: boolean;

  // Optional reason for denial when allowed === false.
  reasonCode?: PermissionDeniedReason;

  // How this permission ended up being granted, when allowed === true.
  // This is used to distinguish normal access from override access,
  // so the UI can clearly indicate when an admin-type user is overriding.
  grantSource?: GrantSource;
}
~~~
