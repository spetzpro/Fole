# Module: core.permissions.PolicyRegistry

## Module ID
core.permissions.PolicyRegistry

## 1. Purpose

The `core.permissions.PolicyRegistry` module provides an **in-memory registry** for permission policies keyed by `(PermissionAction, ResourceType)`.

It is responsible for:

- Storing policy handlers that implement the actual authorization rules.
- Looking up handlers based on action and resource type.
- Initializing default policies for the core actions/resources, including map calibration.

It does not implement the evaluation engine itself (that’s `PermissionService`), but is its primary dependency.

## 2. Responsibilities and Non-Responsibilities

### Responsibilities

- Define `PermissionPolicyHandler` and `PermissionPolicyKey`.
- Provide a registry interface:

  - `registerPolicy(key, handler)`
  - `getPolicyHandler(key)`

- Implement an in-memory registry (`InMemoryPolicyRegistry`).
- Provide `getPolicyRegistry()` as a singleton accessor.
- Provide `initDefaultPolicies()` to register all default policies at startup.

### Non-Responsibilities

- Does **not** define the permission model types (those live in `PermissionModel`).
- Does **not** evaluate policies directly (that’s done by `PermissionService`).
- Does **not** know about UI or feature-specific behavior.

## 3. Public API

> Conceptual API; implementation lives in `src/core/permissions/PolicyRegistry.ts`.

### Types

```ts
type PermissionPolicyHandler = (ctx: PermissionContext, resource: ResourceDescriptor) => PermissionDecision;

interface PermissionPolicyKey {
  action: PermissionAction;
  resourceType: ResourceType;
}
```

### Registry interface

```ts
interface PolicyRegistry {
  registerPolicy(key: PermissionPolicyKey, handler: PermissionPolicyHandler): void;
  getPolicyHandler(key: PermissionPolicyKey): PermissionPolicyHandler | null;
}

declare function getPolicyRegistry(): PolicyRegistry;
declare function initDefaultPolicies(): void;
```

## 4. Default Policies (MVP)

`initDefaultPolicies` registers handlers for at least the following:

- PROJECT_READ / PROJECT_WRITE on `"project"`.
- FILE_READ / FILE_WRITE on `"file"`.
- COMMENT_CREATE / COMMENT_EDIT / COMMENT_DELETE on `"comment"`.
- SKETCH_EDIT on `"sketch"`.
- MAP_EDIT on `"map"`.
- MAP_CALIBRATE on `"map"`.

Each policy:

- Returns NOT_AUTHENTICATED if `ctx.user` is null.
- If a project-scoped resource:
  - Validates that `resource.projectId === ctx.projectMembership?.projectId` (else RESOURCE_NOT_IN_PROJECT).
- Uses effective permission strings to determine grant source:
  - `project_membership` when membership permissions include the base permission.
  - `global_permission` when `ctx.globalPermissions` include the base permission.
  - `override_permission` when either membership or global include the `*.override` permission.

## 5. Implementation Notes

- `InMemoryPolicyRegistry` uses a `Map<string, PermissionPolicyHandler>` keyed by `${action}:${resourceType}`.
- `getPolicyRegistry()` returns a lazily-instantiated singleton.
- Helper functions (e.g., `hasPermission`, `makeDecision`) are used internally to translate permission string presence into `PermissionDecision`.

## 6. Planned vs Implemented

### Current status

- **Lifecycle status**: Stable
  - Implementation exists at `src/core/permissions/PolicyRegistry.ts`.
  - Tests in `tests/core/permissions.test.ts` and `tests/core/mapCalibratePermission.test.ts` exercise default policies thoroughly.
  - Feature tests (e.g., map-related tests) depend on these policies being correctly defined.

### Planned extensions

- Additional policies for new actions/resources as features are added.
- Potential support for policy composition or more advanced keying (e.g. subtypes) in future.

Any such changes must extend this spec and ensure backward compatibility for existing policies.

## 7. Dependencies

### Upstream dependencies

- `PermissionModel` types (actions, resources, context, decision).
- No direct dependencies on core.auth or core.ui.

### Downstream dependents

- `PermissionService` uses PolicyRegistry to evaluate operations.
- Feature modules rely on `initDefaultPolicies` having been called before evaluations.

## 8. Testing Strategy

Tests MUST:

- Call `initDefaultPolicies` before exercising policies.
- Cover:
  - NOT_AUTHENTICATED.
  - project membership grants.
  - global permission grants.
  - override permission grants.
  - project/resource mismatch behavior.
  - MAP_CALIBRATE-specific behavior.

Existing tests already cover these cases; new actions/resources must also be covered.

## 9. CI / Governance Integration

Any change to:

- Default policies.
- Keying strategy for policies.
- GrantSource/denial semantics.

MUST:

1. Update this spec.
2. Update `PolicyRegistry.ts`.
3. Update tests for default policies.
4. Keep `core.permissions` block spec and inventory notes in sync.
5. Ensure `npm run spec:check` passes from the repo root.
