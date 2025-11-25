# Module: core.permissions.PermissionService

## 1. Purpose

Evaluate whether a user can perform an action on a resource, using the policies defined in PolicyRegistry. Provides both a simple boolean check and a structured result that includes why and how access was granted.

## 2. Types

~~~ts
import type {
  PermissionAction,
  PermissionContext,
  ResourceDescriptor,
  PermissionDecision,
} from "./PermissionModel";
~~~

## 3. Public API

~~~ts
export interface PermissionService {
  /**
   * Check if the action is allowed.
   * Returns true if allowed, false otherwise.
   */
  can(
    ctx: PermissionContext,
    action: PermissionAction,
    resource: ResourceDescriptor
  ): boolean;

  /**
   * Same as can(), but returns a structured decision that includes:
   * - allowed
   * - reasonCode (when denied)
   * - grantSource (when allowed)
   */
  canWithReason(
    ctx: PermissionContext,
    action: PermissionAction,
    resource: ResourceDescriptor
  ): PermissionDecision;
}

/**
 * Get the global PermissionService instance.
 */
export function getPermissionService(): PermissionService;
~~~

## 4. Behavior (MVP)

- PermissionService looks up the appropriate policy handler in PolicyRegistry for (action, resource.type).
- If a handler exists, it delegates evaluation to that handler and returns its PermissionDecision.
- If no handler exists, it returns a decision with:
  - allowed = false
  - reasonCode = "UNKNOWN"
- can() is a convenience wrapper around canWithReason(), returning only decision.allowed.
- canWithReason() is the canonical entry point for higher-level code that needs to:
  - show user-facing messaging based on reasonCode
  - distinguish normal access from override access using grantSource.
