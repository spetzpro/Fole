import type {
  PermissionAction,
  PermissionContext,
  ResourceDescriptor,
  PermissionDecision,
} from "./PermissionModel";
import { getPolicyRegistry } from "./PolicyRegistry";

export interface PermissionService {
  can(
    ctx: PermissionContext,
    action: PermissionAction,
    resource: ResourceDescriptor
  ): boolean;

  canWithReason(
    ctx: PermissionContext,
    action: PermissionAction,
    resource: ResourceDescriptor
  ): PermissionDecision;
}

class DefaultPermissionService implements PermissionService {
  can(
    ctx: PermissionContext,
    action: PermissionAction,
    resource: ResourceDescriptor
  ): boolean {
    return this.canWithReason(ctx, action, resource).allowed;
  }

  canWithReason(
    ctx: PermissionContext,
    action: PermissionAction,
    resource: ResourceDescriptor
  ): PermissionDecision {
    const registry = getPolicyRegistry();
    const handler = registry.getPolicyHandler({ action, resourceType: resource.type });

    if (!handler) {
      return { allowed: false, reasonCode: "UNKNOWN" };
    }

    return handler(ctx, resource);
  }
}

let globalPermissionService: PermissionService | null = null;

export function getPermissionService(): PermissionService {
  if (!globalPermissionService) {
    globalPermissionService = new DefaultPermissionService();
  }
  return globalPermissionService;
}
