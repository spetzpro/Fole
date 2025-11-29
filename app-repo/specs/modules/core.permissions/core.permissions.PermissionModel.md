# Module: core.permissions.PermissionModel

## Module ID
core.permissions.PermissionModel

## 1. Purpose

The `core.permissions.PermissionModel` module defines the **vocabulary and data model** for authorization decisions across the application.

It is responsible for:

- Enumerating **actions** (what the user wants to do).
- Enumerating **resource types** and resource descriptors (what the action targets).
- Defining the **permission context** used by policies and the engine.
- Defining the **decision model** (allowed/denied, reasonCode, grantSource).
- Keeping types aligned with `core.auth`’s `CurrentUser` and the roles/permissions spec (`_AI_ROLES_AND_PERMISSIONS.md`).

It does not implement evaluation logic or registry behavior; those belong to `PolicyRegistry` and `PermissionService`.

## 2. Responsibilities and Non-Responsibilities

### Responsibilities

- Define:

  - `CanonicalRole`: core roles (e.g. OWNER, EDITOR, VIEWER, ADMIN).
  - `RoleId`: identifiers for roles (string).
  - `PermissionAction`: actions that can be authorized.
  - `ResourceType`: categories of protected resources.
  - `ResourceDescriptor`: structured description of a resource.
  - `GrantSource`: where a grant came from (project membership, global, override).
  - `ProjectMembershipContext`: project-specific membership and permissions.
  - `CurrentUser`: identity used for permissions (aligned with `core.auth`).
  - `PermissionContext`: all information policies need for a decision.
  - `PermissionDeniedReason`: reasons for denial.
  - `PermissionDecision`: result of a permission evaluation.

- Serve as the **single source of truth** for permission-related types.

### Non-Responsibilities

- Does **not** decide whether a permission is granted (no evaluation).
- Does **not** know about persistence or configuration sources.
- Does **not** implement policy handlers or guards.

## 3. Public Types

> Conceptual definitions; concrete types live in `src/core/permissions/PermissionModel.ts`
> and must remain compatible.

### Roles

```ts
type CanonicalRole = "OWNER" | "EDITOR" | "VIEWER" | "ADMIN";
type RoleId = string;
```

### Actions

The `PermissionAction` union includes (at minimum):

```ts
type PermissionAction =
  | "PROJECT_READ"
  | "PROJECT_WRITE"
  | "FILE_READ"
  | "FILE_WRITE"
  | "COMMENT_CREATE"
  | "COMMENT_EDIT"
  | "COMMENT_DELETE"
  | "SKETCH_EDIT"
  | "MAP_EDIT"
  | "MAP_CALIBRATE";
```

`MAP_CALIBRATE` is explicitly included and its semantics follow `_AI_ROLES_AND_PERMISSIONS.md`
(e.g. project membership grants calibrate, overrides/global can extend access).

### Resource types & descriptors

```ts
type ResourceType = "project" | "file" | "comment" | "sketch" | "map";

interface ResourceDescriptor {
  type: ResourceType;
  id: string;
  projectId?: string;
  ownerId?: string;
}
```

### Grant sources

```ts
type GrantSource =
  | "project_membership"
  | "global_permission"
  | "override_permission";
```

### Project membership

```ts
interface ProjectMembershipContext {
  projectId: string;
  roleId: RoleId;
  permissions: string[]; // effective project-scoped permission strings
}
```

### CurrentUser

`CurrentUser` is structurally aligned with `core.auth`’s `CurrentUser`:

```ts
interface CurrentUser {
  id: string;
  displayName: string;
  email?: string;
  roles: string[];
}
```

Any evolution of this shape MUST be coordinated with `core.auth.CurrentUser`.

### Permission context

```ts
interface PermissionContext {
  user: CurrentUser | null;
  globalPermissions: string[]; // effective global permission strings
  projectMembership?: ProjectMembershipContext;
}
```

`globalPermissions` and `projectMembership.permissions` represent effective permissions
after roles and configuration have been mapped, not raw roles.

### Denial reasons & decisions

```ts
type PermissionDeniedReason =
  | "NOT_AUTHENTICATED"
  | "INSUFFICIENT_ROLE"
  | "RESOURCE_NOT_IN_PROJECT"
  | "UNKNOWN";

interface PermissionDecision {
  allowed: boolean;
  reasonCode?: PermissionDeniedReason;
  grantSource?: GrantSource;
}
```

Policies must produce `PermissionDecision` values following these conventions.

## 4. Planned vs Implemented

### Current status

- **Lifecycle status**: Stable
  - Implementation exists at `src/core/permissions/PermissionModel.ts`.
  - Types are extensively used in `PermissionService`, `PolicyRegistry`, tests, and feature modules.
  - Tests exercise the model indirectly through permission evaluations (including calibration-specific behaviors).

### Planned adjustments

- When roles→permissions mapping is implemented end-to-end, this module may gain:
  - Additional annotations on which actions/resources are covered by config vs code.
- If multi-tenant or multi-project contexts become more complex, `PermissionContext` and `ProjectMembershipContext` may be extended.

Any such changes must preserve backward compatibility for existing actions and be reflected in tests.

## 5. Dependencies

### Upstream dependencies

- Aligns with `core.auth.CurrentUser` shape (but does not import code directly).
- May reference roles/permissions configuration described in `_AI_ROLES_AND_PERMISSIONS.md`.

### Downstream dependents

- `PolicyRegistry`
- `PermissionService`
- `PermissionGuards`
- Any feature code that constructs PermissionContext/ResourceDescriptor directly.

## 6. Testing Expectations

- No direct unit tests are strictly required for this module alone, but:
  - `permissions.test.ts` and `mapCalibratePermission.test.ts` MUST exercise types by:
    - Constructing `PermissionContext` values.
    - Using `PermissionAction` values such as `MAP_CALIBRATE`.
    - Asserting decisions consistent with these types.

As new actions/resources are added, tests must be updated to ensure the model remains consistent.

## 7. CI / Governance Integration

Any change to:

- `PermissionAction` or `ResourceType` unions.
- `PermissionContext` structure.
- `PermissionDecision` or `PermissionDeniedReason`.

MUST:

1. Update this spec.
2. Update `PermissionModel.ts`.
3. Update policies, service logic, and tests that rely on these types.
4. Keep `core.permissions` block spec and inventory notes in sync.
5. Ensure `npm run spec:check` passes from the repo root.
