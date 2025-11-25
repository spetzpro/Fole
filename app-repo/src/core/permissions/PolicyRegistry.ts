import type {
  PermissionAction,
  ResourceType,
  PermissionContext,
  ResourceDescriptor,
  PermissionDecision,
  GrantSource,
} from "./PermissionModel";

export type PermissionPolicyHandler = (
  ctx: PermissionContext,
  resource: ResourceDescriptor
) => PermissionDecision;

export interface PermissionPolicyKey {
  action: PermissionAction;
  resourceType: ResourceType;
}

export interface PolicyRegistry {
  registerPolicy(key: PermissionPolicyKey, handler: PermissionPolicyHandler): void;
  getPolicyHandler(key: PermissionPolicyKey): PermissionPolicyHandler | null;
}

class InMemoryPolicyRegistry implements PolicyRegistry {
  private handlers = new Map<string, PermissionPolicyHandler>();

  registerPolicy(key: PermissionPolicyKey, handler: PermissionPolicyHandler): void {
    const mapKey = this.toKey(key);
    this.handlers.set(mapKey, handler);
  }

  getPolicyHandler(key: PermissionPolicyKey): PermissionPolicyHandler | null {
    const mapKey = this.toKey(key);
    return this.handlers.get(mapKey) ?? null;
  }

  private toKey(key: PermissionPolicyKey): string {
    return `${key.action}:${key.resourceType}`;
  }
}

let globalRegistry: PolicyRegistry | null = null;

export function getPolicyRegistry(): PolicyRegistry {
  if (!globalRegistry) {
    globalRegistry = new InMemoryPolicyRegistry();
  }
  return globalRegistry;
}

function hasPermission(perms: string[] | undefined, required: string): boolean {
  if (!perms) return false;
  return perms.includes(required);
}

function makeDecision(
  hasProject: boolean,
  hasGlobal: boolean,
  hasOverride: boolean
): PermissionDecision {
  if (hasProject) {
    return { allowed: true, grantSource: "project_membership" as GrantSource };
  }
  if (hasGlobal) {
    return { allowed: true, grantSource: "global_permission" as GrantSource };
  }
  if (hasOverride) {
    return { allowed: true, grantSource: "override_permission" as GrantSource };
  }
  return { allowed: false, reasonCode: "INSUFFICIENT_ROLE" };
}

export function initDefaultPolicies(): void {
  const registry = getPolicyRegistry();

  const register = (
    action: PermissionAction,
    resourceType: ResourceType,
    basePermission: string
  ) => {
    const key: PermissionPolicyKey = { action, resourceType };

    const handler: PermissionPolicyHandler = (ctx, resource) => {
      const projectPerm = basePermission;
      const overridePerm = `${basePermission}.override`;

      const projectPermissions = ctx.projectMembership?.permissions;
      const globalPermissions = ctx.globalPermissions;

      const hasProject = hasPermission(projectPermissions, projectPerm);
      const hasGlobal = hasPermission(globalPermissions, projectPerm);
      const hasOverride = hasPermission(globalPermissions, overridePerm);

      const decision = makeDecision(hasProject, hasGlobal, hasOverride);

      if (!decision.allowed && !ctx.user) {
        return { allowed: false, reasonCode: "NOT_AUTHENTICATED" };
      }

      // Basic project/resource consistency checks for project-scoped resources.
      if (
        resource.projectId &&
        ctx.projectMembership &&
        resource.projectId !== ctx.projectMembership.projectId
      ) {
        return { allowed: false, reasonCode: "RESOURCE_NOT_IN_PROJECT" };
      }

      return decision;
    };

    registry.registerPolicy(key, handler);
  };

  register("PROJECT_READ", "project", "projects.read");
  register("PROJECT_WRITE", "project", "projects.write");
  register("FILE_READ", "file", "files.read");
  register("FILE_WRITE", "file", "files.write");
  register("COMMENT_CREATE", "comment", "comments.create");
  register("COMMENT_EDIT", "comment", "comments.edit");
  register("COMMENT_DELETE", "comment", "comments.delete");
  register("SKETCH_EDIT", "sketch", "sketch.edit");
  register("MAP_EDIT", "map", "map.edit");
  register("MAP_CALIBRATE", "map", "map.calibrate");
}
