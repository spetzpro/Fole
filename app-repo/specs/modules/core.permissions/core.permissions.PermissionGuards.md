# Module: core.permissions.PermissionGuards

## 1. Purpose

Provide convenience helpers for using permissions in higher-level code (services, UI, command handlers). Wraps PermissionService and standardizes how permission failures are surfaced (boolean, Result, or thrown error).

## 2. Public API

~~~ts
import type {
  PermissionAction,
  ResourceDescriptor,
  PermissionContext,
} from "./PermissionModel";
import type { Result, AppError } from "@/core/foundation/CoreTypes";

/**
 * Convenience: derive PermissionContext from CurrentUser and environment.
 */
export function createPermissionContextFromCurrentUser(): PermissionContext;

/**
 * For imperative checks where the caller wants a simple boolean.
 */
export function canPerform(
  action: PermissionAction,
  resource: ResourceDescriptor
): boolean;

/**
 * For call chains that prefer Result style.
 * Returns ok(void) when allowed, or err(AppError) with code PERMISSION_DENIED when not.
 */
export function ensureCanPerform(
  action: PermissionAction,
  resource: ResourceDescriptor
): Result<void, AppError>;

/**
 * For places where throwing is simpler (e.g. guards in UI or services).
 * Throws an AppError with code PERMISSION_DENIED when not allowed.
 */
export function assertCanPerform(
  action: PermissionAction,
  resource: ResourceDescriptor
): void;
~~~

## 3. Notes

- Internally, these helpers may use PermissionService.canWithReason()
  to obtain full PermissionDecision information.
- UI layers that need to visually indicate override behavior should
  inspect grantSource on the decision (e.g. "override_permission")
  and render appropriate badges, labels, or tooltips. The guards
  themselves do not enforce any particular UI; they only standardize
  how permission failures are surfaced to callers.
