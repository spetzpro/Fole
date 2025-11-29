# Block: core.permissions

## Block ID
core.permissions

## 1. Purpose

The `core.permissions` block is the central **policy engine** for determining whether a user may perform an action on a resource. It defines the permission vocabulary, evaluation rules, default policies, and convenience guards used across the application.

It is responsible for:

- Defining the **permission model**: actions, resources, contexts, decisions.
- Providing a **policy registry** for mapping (action, resourceType) → policy handlers.
- Implementing the **permission evaluation engine**.
- Providing **guards** for UI and service-level authorization decisions.
- Integrating project membership, global permissions, and override permissions into consistent decision logic.

It is not responsible for:

- Authentication (handled by `core.auth`).
- UI rendering of allowed/denied states (`core.ui`).
- Storing users/roles/permissions in a backend.
- Feature-specific business logic.

## 2. Scope and Non-Scope

### In scope

- Permission actions and types (including MAP_CALIBRATE).
- Resource descriptors for project/file/comment/sketch/map resources.
- PermissionContext derived from user identity and membership.
- Decision logic (allowed/reasonCode/grantSource).
- Policy registration and default policies.
- Permission guards for boolean, Result, and exception-based enforcement.

### Out of scope

- Identity, session, and roles (core.auth).
- UI behavior for permission failures (core.ui).
- Feature-specific side-effects or workflows.

## 3. Block Decomposition

| Module ID                                 | Responsibility                                            | Status       |
|-------------------------------------------|-----------------------------------------------------------|--------------|
| `core.permissions.PermissionModel`        | Permission vocabulary and core types                      | Stable       |
| `core.permissions.PolicyRegistry`         | Registration and lookup of policy handlers                | Stable       |
| `core.permissions.PermissionService`      | Evaluation engine (`can` / `canWithReason`)               | Stable       |
| `core.permissions.PermissionGuards`       | Convenience enforcement helpers for UI/services           | Implemented  |

### Block lifecycle status: **Implemented**

- Engine modules (Model, Registry, Service) are implemented and well tested.
- Guards are implemented, but under-tested and will be improved as projectMembership and roles→permissions mapping are refined.

## 4. Responsibilities per Module

### 4.1 PermissionModel (Stable)

Defines:

- `PermissionAction` union including PROJECT_READ/WRITE, FILE_READ/WRITE, COMMENT_*, SKETCH_EDIT, MAP_EDIT, **MAP_CALIBRATE**.
- `ResourceType` and `ResourceDescriptor`.
- `PermissionContext` (CurrentUser, globalPermissions, projectMembership).
- `PermissionDecision` (allowed, reasonCode, grantSource).
- `PermissionDeniedReason` and `GrantSource`.

Highly stable and tested indirectly through policy and service tests.

### 4.2 PolicyRegistry (Stable)

- Stores policy handlers in an in-memory registry.
- Keyed by `(action, resourceType)`.
- Default policies include:
  - PROJECT_READ/WRITE
  - FILE_READ/WRITE
  - COMMENT_CREATE/EDIT/DELETE
  - SKETCH_EDIT
  - MAP_EDIT
  - **MAP_CALIBRATE**
- Enforces NOT_AUTHENTICATED, RESOURCE_NOT_IN_PROJECT, and grantSource semantics.

### 4.3 PermissionService (Stable)

- Implements:
  - `can(ctx, action, resource)` → boolean
  - `canWithReason(ctx, action, resource)` → PermissionDecision
- Delegates to PolicyRegistry.
- Returns UNKNOWN for unregistered policies.
- Used across core and feature modules.

### 4.4 PermissionGuards (Implemented)

- Implements:
  - `createPermissionContextFromCurrentUser`
  - `canPerform`
  - `ensureCanPerform`
  - `assertCanPerform`
- Uses CurrentUserProvider and PermissionService.
- Current limitations:
  - Assumes presence of a `permissions` field in CurrentUser (not in core.auth).
  - Does not derive projectMembership.
  - Lacks dedicated tests.

Will be upgraded during future iterations.

## 5. Invariants and Guarantees

- Permission checks are deterministic: decision = f(ctx, action, resource).
- Policies must set reasonCode and grantSource.
- Default policies enforce authentication and scope rules.
- `MAP_CALIBRATE` follows calibration-specific override behavior per `_AI_ROLES_AND_PERMISSIONS.md`.

## 6. Dependencies

### Allowed dependencies

- `core.auth` for CurrentUser identity.
- `core.foundation` for Result/AppError/diagnostics.
- Config for roles→permissions mapping (from `_AI_ROLES_AND_PERMISSIONS.md` or similar).

### Prohibited

- `core.ui`
- `core.storage` / DB
- `feature.*` (permissions must be feature-agnostic)

### Downstream consumers

- `core.ui` (guards)
- `feature.map`, `feature.files`, etc.
- Any service requiring authorization.

## 7. Performance Considerations

- All operations are pure and O(1) / O(n) in small arrays.
- No IO.
- No dedicated performance budget required.

## 8. Testing Strategy

- Default policies tested in:
  - `permissions.test.ts`
  - `mapCalibratePermission.test.ts`
- PermissionService tested via default policies.
- Guards require dedicated test coverage in future.
- Future tests will validate identity→permissions mapping when added.

## 9. CI and Governance Integration

Changes to:

- PermissionAction or ResourceType.
- PolicyRegistry default policies.
- PermissionContext structure.
- PermissionDecision semantics.

MUST:

1. Update this block spec.
2. Update module specs.
3. Update implementation + tests.
4. Update inventory entries.
5. Ensure `npm run spec:check` passes.

