# Core Module Spec — AccessControl

## Module ID

`core.accessControl`

---

## Purpose

The AccessControl module is responsible for **authentication**, **session handling**, and **authorization context** for all operations in the system.

It provides:

- A unified way to authenticate a principal (user or system).
- A session abstraction that encapsulates identity, roles, and project membership.
- A **PermissionContext** that downstream modules and services use to check capabilities (e.g. `PROJECT_READ`, `PROJECT_WRITE`, `MAP_EDIT`).
- Integration with the global roles/permissions model defined in `_AI_ROLES_AND_PERMISSIONS.md`.

It does **not** implement business logic for individual features; it only answers:
> “Who is this actor, and what are they allowed to do in this project/context?”

---

## State Shape

AccessControl owns **session and principal metadata** for the application. Persistent state is stored via `core.moduleStateRepository` under `moduleId = "core.accessControl"`.

Conceptual persisted state shape:

```ts
type AccessControlState = {
  // Optional directory of known users/principals.
  // Not required for all deployments (could be external).
  principals?: Record<string, PrincipalRecord>;

  // System-wide or per-project role bindings (if stored here;
  // some deployments may externalize this).
  roleBindings?: RoleBindingRecord[];
};

type PrincipalRecord = {
  principalId: string;   // internal unique id (user, service account, etc.)
  displayName: string;
  email?: string;
  // Optional flags (locked/disabled/etc.)
  isActive: boolean;
};

type RoleBindingRecord = {
  bindingId: string;
  principalId: string;
  scope: "system" | "project";
  projectId?: string;    // required if scope === "project"
  roleId: string;        // matches a role defined in _AI_ROLES_AND_PERMISSIONS.md
};
```

> **Note:** Actual identity provider (IdP) details (OAuth, SSO, etc.) are **outside** this module’s persisted state.
The module can be wired to external IdPs via adapters.

AccessControl is also responsible for **ephemeral** session state (in memory, tokens, etc.). This is not persisted through `ModuleStateRepository`, but follows the same logical model.

---

## Core Types

These types are exposed to the rest of the system.

```ts
type Permission = string; // e.g. "PROJECT_READ", "MAP_EDIT", "USER_MANAGE"

type RoleId = string;     // e.g. "project.admin", "project.viewer"

type PrincipalId = string;

type PermissionContext = {
  // Who is acting
  principalId: PrincipalId;
  // Project-scoped view (if applicable)
  projectId?: string;
  // Directly granted permissions in this context
  permissions: Permission[];
  // Roles that were used to derive permissions
  roles: RoleId[];
  // Is this a system/internal actor
  isSystem: boolean;
};

type AccessControlContext = {
  // Tenant / project isolation
  projectId?: string;

  // Current authenticated principal, if any
  principalId?: PrincipalId;

  // Optional trace/diagnostic metadata
  traceId?: string;
};
```

The **PermissionContext** is what downstream modules and services receive when they need to decide whether an operation is allowed.

---

## Blocks

Conceptual blocks used internally by the AccessControl module:

- `core.block.resolvePrincipal`
  - Purpose: Given an authentication token or credentials, resolve a `PrincipalId` and basic principal info.
  - Typically wired to an IdP adapter (e.g. OAuth, SSO).

- `core.block.resolveRolesForPrincipal`
  - Purpose: Given `principalId` and optional `projectId`, compute the set of `RoleId`s assigned (system + project scoped).

- `core.block.expandRolesToPermissions`
  - Purpose: Given a set of `RoleId`s, expand to concrete `Permission[]` using the mapping defined in `_AI_ROLES_AND_PERMISSIONS.md`.

- `core.block.buildPermissionContext`
  - Purpose: Compose the `PermissionContext` from principal, project, roles, and derived permissions.

- `core.block.checkPermission`
  - Purpose: Given a `PermissionContext` and required permission(s), decide allow/deny and emit a structured decision object.

These blocks are **internal building blocks**. External callers primarily use the **Public API** defined below.

---

## Public API (Operations)

### `authenticatePrincipal`

**Conceptual signature:**

```ts
authenticatePrincipal(
  credentials: unknown
): Promise<{ principalId: PrincipalId; isSystem: boolean }>;
```

**Inputs:**

- `credentials`: data from upstream auth layer (token, header, cookie, etc.).

**Outputs:**

- `principalId`
- `isSystem` flag (true for internal/system actors).

**Behavior:**

- Delegates to `resolvePrincipal` block.
- Does **not** decide project or permissions yet; it only establishes identity.
- May throw `AuthenticationError` if credentials are invalid or expired.

---

### `createPermissionContext`

Construct a `PermissionContext` for a given principal and optional project.

```ts
createPermissionContext(
  ctx: AccessControlContext,
  principalId: PrincipalId,
  projectId?: string
): Promise<PermissionContext>;
```

**Inputs:**

- `ctx`: ambient context (trace id, etc.).
- `principalId`: authenticated identity (from `authenticatePrincipal`).
- `projectId` (optional): if provided, derive project-scoped permissions.

**Outputs:**

- `PermissionContext` which can be attached to downstream calls.

**Behavior:**

- Uses `resolveRolesForPrincipal` to determine roles in the given scope.
- Uses `expandRolesToPermissions` to derive permissions.
- Marks `isSystem = true` if principal corresponds to a system actor (according to configuration).
- If `projectId` is provided but the principal has **no relationship** to that project, it may either:
  - Return a context with **no permissions**, or
  - Throw `AccessDeniedError` depending on configuration.

The recommended default is **no permissions** but no error, so callers explicitly check permissions before acting.

---

### `assertPermission`

Helper used by modules/services to enforce authorization for a specific operation.

```ts
assertPermission(
  permissionContext: PermissionContext,
  required: Permission | Permission[]
): void; // throws on failure
```

**Inputs:**

- `permissionContext`: produced by `createPermissionContext` or passed down from caller.
- `required`: single permission or an array (interpreted as logical AND).

**Behavior:**

- Checks whether `permissionContext.permissions` contains all required permissions.
- If not, throws `AccessDeniedError` with metadata:
  - `principalId`
  - `projectId`
  - `missingPermissions: Permission[]`

This is the **primary enforcement API** used in core and feature modules.

---

### `checkPermission` (non-throwing)

Allows callers to query permissions without exceptions.

```ts
checkPermission(
  permissionContext: PermissionContext,
  required: Permission | Permission[]
): { allowed: boolean; missing: Permission[] };
```

**Behavior:**

- Same evaluation as `assertPermission`, but returns a result object instead of throwing.
- Used by UI view-models or other code that needs to **render** decisions instead of enforcing them immediately.

---

### `listRolesForPrincipal` (tooling / introspection)

```ts
listRolesForPrincipal(
  principalId: PrincipalId,
  projectId?: string
): Promise<RoleId[]>;
```

**Behavior:**

- Returns the effective roles in a given scope.
- Useful for admin tooling, debug UIs, and tests.

---

## Lifecycle

### Initialization

At startup, AccessControl is wired with:

- **Role definitions and permission mappings** from `_AI_ROLES_AND_PERMISSIONS.md` (or its runtime equivalent).
- **IdP adapters** (or a stub) to resolve principals from credentials.
- Optional access to `ModuleStateRepository` if role bindings are persisted in project state.

### Normal Operation

Typical request flow:

1. Upstream layer calls `authenticatePrincipal` with credentials → gets `principalId`.
2. For project-scoped operations, the caller obtains a `PermissionContext` via `createPermissionContext(ctx, principalId, projectId)`.
3. Services and modules call `assertPermission` or `checkPermission` before mutating or reading sensitive state.

### Migration / Upgrade

Changes to roles and permissions are defined in `_AI_ROLES_AND_PERMISSIONS.md` and reflected in:

- The role-to-permission mapping logic.
- Optional migration of stored role bindings (e.g. renaming roles).

AccessControl itself does not define a migration scheme beyond what `ModuleStateRepository` and the persisted `AccessControlState` require.

---

## Dependencies

- **Identity Provider (IdP) / Authentication Adapter**
  - OAuth/OpenID/SSO/etc. or a test stub.
  - Provides principal resolution from credentials.

- **ModuleStateRepository (optional but recommended)**
  - Used to persist `AccessControlState` (principals, role bindings) when managed internally.

- **Configuration / Role Definitions**
  - Static or dynamic source for:
    - Role IDs.
    - Permission sets per role.
    - System actors.

AccessControl must **not** depend on:

- Feature modules.
- UI modules.

It sits in the **core backend layer** and is referenced by services and modules that need authorization.

---

## Security Model

- All authorization decisions must go through **PermissionContext → assert/checkPermission**.
- Direct role/permission checks via ad-hoc enums or raw strings outside this module are considered **forbidden** in code review.
- Project isolation:
  - `projectId` in `PermissionContext` scopes permissions to that project.
  - Cross-project access must be explicitly modeled (e.g. system-wide admin role).
- System actors:
  - A subset of principals are flagged as `isSystem` and may bypass some checks according to `_AI_ROLES_AND_PERMISSIONS.md`.
  - This must be explicit and auditable.

---

## Error Model

- `AuthenticationError`
  - Thrown by `authenticatePrincipal` when credentials are invalid, expired, or unresolvable.

- `AccessDeniedError`
  - Thrown by `assertPermission` when required permissions are not present.
  - Includes metadata: `principalId`, `projectId`, `required`, `missing`.

- `RoleResolutionError`
  - Thrown when configured roles, bindings, or mappings are inconsistent or missing (e.g. unknown `roleId`).

- `AccessControlConfigurationError`
  - Thrown at startup or lazily if the roles/permissions configuration is invalid.

All errors must be:

- Well-typed.
- Safe to expose at a high level (no leaking secrets or internal tokens).
- Mappable to transport-level error codes (e.g. HTTP 401/403) in higher layers.

---

## Test Matrix

The following scenarios must be covered by tests for the AccessControl module:

1. **Successful authentication**
   - Valid credentials resolve to a `principalId` and `isSystem === false`.

2. **Failed authentication**
   - Invalid credentials → `AuthenticationError`.

3. **System principal**
   - System credentials resolve to `isSystem === true` and behave as expected in `createPermissionContext`.

4. **Role resolution (system scope)**
   - Given a `principalId` with system roles, `createPermissionContext` returns all expected permissions.

5. **Role resolution (project scope)**
   - Given `principalId` + `projectId`, project-specific roles are resolved and permissions are scoped correctly.

6. **No project membership**
   - Principal with **no** binding to a given `projectId` results in:
     - Either an empty permission set, or
     - `AccessDeniedError` (depending on chosen semantics for your implementation).
   - The chosen behavior must be explicitly tested.

7. **assertPermission success**
   - `assertPermission` does not throw when `PermissionContext` includes all required permissions.

8. **assertPermission failure**
   - `assertPermission` throws `AccessDeniedError` and `missing` in metadata is correct.

9. **checkPermission behavior**
   - Returns `{ allowed: true, missing: [] }` in allowed scenario.
   - Returns `{ allowed: false, missing: [...] }` in denied scenario.

10. **Configuration errors**
    - Misconfigured role → `RoleResolutionError`.
    - Invalid role-to-permission mapping → `AccessControlConfigurationError`.

11. **Project isolation**
    - Same `principalId` has different permissions in different projects, according to role bindings.

12. **System actor override (if applicable)**
    - A system principal with global admin role has expected permissions in any project context.

These tests ensure that AccessControl is predictable, auditable, and safe to use as the single authorization authority in the system.
