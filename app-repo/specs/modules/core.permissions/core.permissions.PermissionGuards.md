# Module: core.permissions.PermissionGuards

## Module ID
core.permissions.PermissionGuards

## 1. Purpose

The `core.permissions.PermissionGuards` module provides **convenience helpers** on top of `PermissionService` for higher-level code (services, UI, routing).

It is responsible for:

- Creating a `PermissionContext` for the **current user** in simple cases.
- Exposing guard functions:
  - `canPerform` → boolean.
  - `ensureCanPerform` → Result<void, AppError>.
  - `assertCanPerform` → throws AppError.
- Wrapping permission denials in structured errors with `reasonCode` and `grantSource` in error details.

It is not the canonical way to construct `PermissionContext` for project-scoped decisions; complex flows may build contexts explicitly and call `PermissionService` directly.

## 2. Responsibilities and Non-Responsibilities

### Responsibilities

- Implement:

  - `createPermissionContextFromCurrentUser()`: builds a best-effort `PermissionContext` for the current user.
  - `canPerform(action, resource)`: boolean check using the current user.
  - `ensureCanPerform(action, resource)`: returns `Result<void, AppError>` with PERMISSION_DENIED on failure.
  - `assertCanPerform(action, resource)`: throws `AppError` on denial.

- Use `CurrentUserProvider` to obtain the current user.
- Use `PermissionService` to evaluate permissions.

### Non-Responsibilities

- Does **not** fully derive `PermissionContext` for project-scoped checks:
  - MVP implementation uses only global-like data and does not set `projectMembership`.
- Does **not** replace explicit context construction in more complex scenarios.
- Does **not** implement UI or virtualization of “forbidden” states; it only throws/returns errors.

## 3. Public API

> Conceptual API; implementation lives in `src/core/permissions/PermissionGuards.ts`.

```ts
function createPermissionContextFromCurrentUser(): PermissionContext;

function canPerform(action: PermissionAction, resource: ResourceDescriptor): boolean;

function ensureCanPerform(
  action: PermissionAction,
  resource: ResourceDescriptor
): Result<void, AppError>;

function assertCanPerform(action: PermissionAction, resource: ResourceDescriptor): void;
```

## 4. Current Behavior (Phase 1)

- `createPermissionContextFromCurrentUser`:
  - Calls `getCurrentUserProvider().getCurrentUser()`.
  - Uses `deriveGlobalPermissionsForUser(user)` from `PermissionModel`, which applies the static `CANONICAL_ROLE_PERMISSIONS` mapping to `CurrentUser.roles`.
  - Builds a `PermissionContext` with:
    - `user` = CurrentUser | null.
    - `globalPermissions` = effective global permission strings derived from canonical roles.
    - `projectMembership` = `undefined` (project-scoped membership wiring is deferred to a later phase).

- `canPerform`:
  - Calls `createPermissionContextFromCurrentUser` and then `getPermissionService().can(ctx, action, resource)`.

- `ensureCanPerform`:
  - Uses `canWithReason` to get a `PermissionDecision`.
  - If allowed → returns `Ok<void>`.
  - If denied → returns `Err(AppError)` with:
    - `code: "PERMISSION_DENIED"`
    - details including `reasonCode` and `grantSource`.

- `assertCanPerform`:
  - Calls `ensureCanPerform`.
  - Throws the `AppError` when denied.

## 5. Planned vs Implemented

### Current status

- **Lifecycle status**: Stable
  - Implementation exists at `src/core/permissions/PermissionGuards.ts`.
  - Guards are covered by dedicated tests that exercise `canPerform`, `ensureCanPerform`, `assertCanPerform`, and `createPermissionContextFromCurrentUser`.
  - The implementation is used by features that want a simple, roles-driven way to build `PermissionContext` from the current user.

### Planned improvements

- **Project membership wiring**:
  - Extend Guards (or higher-level helpers) to derive `projectMembership` when a project context is available (e.g., active project from core.ui).

ProjectMembership- and tenant-configuration-driven permissions remain planned work and will be added in a subsequent phase.

## 6. Dependencies

### Upstream dependencies

- `CurrentUserProvider` from `core.auth` for identity.
- `PermissionService` from `core.permissions` for evaluation.
- `AppError` and `Result` from `core.foundation`.

### Downstream dependents

- UI and services that want simple “guard-like” checks and exceptions.

## 7. Error Model

- `canPerform` returns `false` on denial; never throws.
- `ensureCanPerform`:
  - Returns `Err(AppError)` on denial with:
    - `code: "PERMISSION_DENIED"`
    - `details.reasonCode` and `details.grantSource`.
- `assertCanPerform`:
  - Throws `AppError` on denial with the same details.
- Errors from PermissionService (e.g., coding errors) propagate as thrown exceptions; expected permission denials are wrapped as above.

## 8. Testing Strategy

Planned tests MUST:

- Use fake CurrentUserProvider and PermissionService to simulate:
  - allowed and denied decisions with various reasonCodes/grantSources.
- Verify that:
  - `canPerform` matches `canWithReason().allowed`.
  - `ensureCanPerform` wraps denials in a Result with proper AppError metadata.
  - `assertCanPerform` throws AppError with the same metadata.

Until such tests exist, Guards are considered Implemented but not Stable.

## 9. CI / Governance Integration

Any change to:

- How PermissionContext is built for the current user.
- The interface of Guards.
- The way errors are constructed.

MUST:

1. Update this spec.
2. Update `PermissionGuards.ts`.
3. Add/update tests for Guards.
4. Keep `core.permissions` block spec and inventory notes in sync.
5. Ensure `npm run spec:check` passes from the repo root.
