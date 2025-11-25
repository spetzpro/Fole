# Module: core.permissions.PolicyRegistry

## 1. Purpose

Store and retrieve permission policies for (action, resourceType) pairs. Each policy decides whether a user can perform an action on a given resource, and indicates how access was granted (normal membership, global permission, or explicit override).

## 2. Types

~~~ts
import type {
  PermissionAction,
  ResourceType,
  PermissionContext,
  ResourceDescriptor,
  PermissionDecision,
} from "./PermissionModel";

// A policy handler evaluates a single permission check.
export type PermissionPolicyHandler = (
  ctx: PermissionContext,
  resource: ResourceDescriptor
) => PermissionDecision;

export interface PermissionPolicyKey {
  action: PermissionAction;
  resourceType: ResourceType;
}
~~~

## 3. Public API

~~~ts
export interface PolicyRegistry {
  /**
   * Register a policy handler for a given (action, resourceType) pair.
   * Intended for initialization wiring, not runtime changes.
   */
  registerPolicy(
    key: PermissionPolicyKey,
    handler: PermissionPolicyHandler
  ): void;

  /**
   * Get the handler for this (action, resourceType), or null if none.
   */
  getPolicyHandler(
    key: PermissionPolicyKey
  ): PermissionPolicyHandler | null;
}

/**
 * Get the global PolicyRegistry singleton.
 */
export function getPolicyRegistry(): PolicyRegistry;

/**
 * Called at startup to install the default policies.
 * (OWNER/EDITOR/VIEWER/ADMIN behavior, override permissions, etc.)
 */
export function initDefaultPolicies(): void;
~~~

## 4. Behavior (MVP)

- Policies are stored in-memory and registered at startup via initDefaultPolicies.
- Each PermissionPolicyHandler:
  - must decide allowed: true/false
  - should set reasonCode when allowed is false
  - should set grantSource when allowed is true:
    - "project_membership" if granted via project membership permissions
    - "global_permission" if granted via global/system permissions
    - "override_permission" if granted via explicit override permissions
- If no policy is registered for a given (action, resourceType), PermissionService will treat that as a default deny.
