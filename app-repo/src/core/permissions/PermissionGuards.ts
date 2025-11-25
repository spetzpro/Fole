import type {
  PermissionAction,
  ResourceDescriptor,
  PermissionContext,
} from "./PermissionModel";
import type { Result, AppError } from "@/core/foundation/CoreTypes";
import { err, ok } from "@/core/foundation/CoreTypes";
import { getCurrentUserProvider } from "@/core/auth/CurrentUserProvider";
import { getPermissionService } from "./PermissionService";

export function createPermissionContextFromCurrentUser(): PermissionContext {
  const currentUserProvider = getCurrentUserProvider();
  const user = currentUserProvider.getCurrentUser();

  const ctx: PermissionContext = {
    user,
    globalPermissions: user?.permissions ?? [],
  } as PermissionContext;

  return ctx;
}

export function canPerform(
  action: PermissionAction,
  resource: ResourceDescriptor
): boolean {
  const ctx = createPermissionContextFromCurrentUser();
  const service = getPermissionService();
  return service.can(ctx, action, resource);
}

export function ensureCanPerform(
  action: PermissionAction,
  resource: ResourceDescriptor
): Result<void, AppError> {
  const ctx = createPermissionContextFromCurrentUser();
  const service = getPermissionService();
  const decision = service.canWithReason(ctx, action, resource);

  if (decision.allowed) {
    return ok(undefined);
  }

  return err({
    code: "PERMISSION_DENIED",
    message: "Permission denied",
    details: {
      reasonCode: decision.reasonCode,
      grantSource: decision.grantSource,
    },
  });
}

export function assertCanPerform(
  action: PermissionAction,
  resource: ResourceDescriptor
): void {
  const result = ensureCanPerform(action, resource);
  if (!result.ok) {
    throw result.error;
  }
}
