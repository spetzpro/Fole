export type CanonicalRole = "OWNER" | "EDITOR" | "VIEWER" | "ADMIN";

export type RoleId = string;

export type PermissionAction =
  | "PROJECT_READ"
  | "PROJECT_WRITE"
  | "PROJECT_EXPORT"
  | "FILE_READ"
  | "FILE_WRITE"
  | "COMMENT_CREATE"
  | "COMMENT_EDIT"
  | "COMMENT_DELETE"
  | "SKETCH_EDIT"
  | "MAP_EDIT"
  | "MAP_CALIBRATE";

export type ResourceType = "project" | "file" | "comment" | "sketch" | "map";

export interface ResourceDescriptor {
  type: ResourceType;
  id: string;
  projectId?: string;
  ownerId?: string;
}

export type GrantSource =
  | "project_membership"
  | "global_permission"
  | "override_permission";

export interface ProjectMembershipContext {
  projectId: string;
  roleId: RoleId;
  permissions: string[];
}

export interface CurrentUser {
  id: string;
  displayName: string;
  email?: string;
  roles: string[];
}

export interface PermissionContext {
  user: CurrentUser | null;
  globalPermissions: string[];
  projectMembership?: ProjectMembershipContext;
}

export type PermissionDeniedReason =
  | "NOT_AUTHENTICATED"
  | "INSUFFICIENT_ROLE"
  | "NOT_OWNER"
  | "RESOURCE_NOT_IN_PROJECT"
  | "UNKNOWN";

export interface PermissionDecision {
  allowed: boolean;
  reasonCode?: PermissionDeniedReason;
  grantSource?: GrantSource;
}

// Canonical role-to-permissions mapping for MVP.
// This covers only CanonicalRole values and uses existing PolicyRegistry base strings.
export const CANONICAL_ROLE_PERMISSIONS: Record<CanonicalRole, readonly string[]> = {
  VIEWER: ["projects.read", "files.read"],
  EDITOR: [
    "projects.read",
    "projects.write",
    "files.read",
    "files.write",
    "comments.create",
    "comments.edit",
    "comments.delete",
    "sketch.edit",
    "map.edit",
  ],
  OWNER: [
    "projects.read",
    "projects.write",
    "files.read",
    "files.write",
    "comments.create",
    "comments.edit",
    "comments.delete",
    "sketch.edit",
    "map.edit",
    "map.calibrate",
    "projects.export",
  ],
  ADMIN: [
    "projects.read",
    "projects.write",
    "files.read",
    "files.write",
    "comments.create",
    "comments.edit",
    "comments.delete",
    "sketch.edit",
    "map.edit",
    "map.calibrate",
    "projects.export",
  ],
};

export function deriveGlobalPermissionsForUser(user: CurrentUser | null): string[] {
  if (!user) return [];

  const perms = new Set<string>();

  for (const role of user.roles) {
    if ((CANONICAL_ROLE_PERMISSIONS as Record<string, readonly string[]>)[role]) {
      for (const p of (CANONICAL_ROLE_PERMISSIONS as Record<string, readonly string[]>)[role]) {
        perms.add(p);
      }
    }
  }

  return Array.from(perms);
}

export function deriveProjectMembershipForUser(
  user: CurrentUser,
  projectId: string,
  projectRoleIdOverride?: RoleId
): ProjectMembershipContext {
  const roleId: CanonicalRole =
    projectRoleIdOverride &&
    (CANONICAL_ROLE_PERMISSIONS as Record<string, readonly string[]>)[
      projectRoleIdOverride as CanonicalRole
    ]
      ? (projectRoleIdOverride as CanonicalRole)
      : "VIEWER";

  const permissions = Array.from(CANONICAL_ROLE_PERMISSIONS[roleId]);

  return {
    projectId,
    roleId,
    permissions,
  };
}
