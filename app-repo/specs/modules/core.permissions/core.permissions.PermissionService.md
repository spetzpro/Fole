# Module: core.permissions.PermissionService

## Module ID
core.permissions.PermissionService

## 1. Purpose

The `core.permissions.PermissionService` module implements the **core evaluation engine** for permission checks.

It is responsible for:

- Looking up the appropriate policy handler for a given `(action, resourceType)`.
- Calling the handler with a `PermissionContext` and `ResourceDescriptor`.
- Returning either:
  - A boolean (`can`), or
  - A full `PermissionDecision` (`canWithReason`).

It does not own the permission model or policy definitions; it orchestrates evaluation using `PolicyRegistry` and `PermissionModel`.

## 2. Responsibilities and Non-Responsibilities

### Responsibilities

- Provide:

  - `can(ctx, action, resource): boolean`
  - `canWithReason(ctx, action, resource): PermissionDecision`

- Delegate policy selection to `PolicyRegistry`.
- Return `allowed: false, reasonCode: "UNKNOWN"` when no policy is found.

### Non-Responsibilities

- Does **not** define policies (that’s `PolicyRegistry`).
- Does **not** construct `PermissionContext`; it expects callers to do so.
- Does **not** implement UI or flow control; it only answers “is this allowed?” and “why?”.

## 3. Public API

> Conceptual API; implementation lives in `src/core/permissions/PermissionService.ts`.

```ts
interface PermissionService {
  can(ctx: PermissionContext, action: PermissionAction, resource: ResourceDescriptor): boolean;
  canWithReason(
    ctx: PermissionContext,
    action: PermissionAction,
    resource: ResourceDescriptor
  ): PermissionDecision;
}

declare function getPermissionService(): PermissionService;
```

## 4. Behavior

- `canWithReason`:
  - Builds a key `{ action, resourceType: resource.type }`.
  - Calls `getPolicyRegistry().getPolicyHandler(key)`.
  - If handler exists:
    - Returns `handler(ctx, resource)`.
  - If no handler exists:
    - Returns `{ allowed: false, reasonCode: "UNKNOWN" }`.

- `can`:
  - Calls `canWithReason` and returns `decision.allowed`.

The service is intentionally thin and defers complexity to PolicyRegistry and handlers.

## 5. Planned vs Implemented

### Current status

- **Lifecycle status**: Stable
  - Implementation exists at `src/core/permissions/PermissionService.ts`.
  - Tests (`permissions.test.ts`, `mapCalibratePermission.test.ts`) exercise `canWithReason` via default policies.
  - Feature tests (e.g., FeatureMapService) depend on PermissionService’s behavior.

### Planned enhancements

- None required at the engine level; future changes are likely confined to policies or contexts rather than PermissionService itself.

## 6. Dependencies

### Upstream dependencies

- `PermissionModel` (types).
- `PolicyRegistry` for handler lookup.

### Downstream dependents

- `PermissionGuards`.
- Feature services (e.g., FeatureMapService) that perform explicit checks.

## 7. Testing Strategy

Tests MUST:

- Call `initDefaultPolicies` before using the service.
- Verify:
  - Denials and grants for each core action.
  - Correct reasonCode and grantSource behavior (via handlers).
  - Proper behavior for `UNKNOWN` policies when none are registered.

Existing tests already cover these; new actions should be added in both policies and tests.

## 8. CI / Governance Integration

Any change to:

- Method signatures.
- Default behavior when no handler is found.

MUST:

1. Update this spec.
2. Update `PermissionService.ts`.
3. Update tests.
4. Keep the `core.permissions` block spec and inventory notes in sync.
5. Ensure `npm run spec:check` passes.
