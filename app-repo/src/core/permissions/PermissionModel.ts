export type CanonicalRole = "OWNER" | "EDITOR" | "VIEWER" | "ADMIN";

export type RoleId = string;

export type PermissionAction =
  | "PROJECT_READ"
  | "PROJECT_WRITE"
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
