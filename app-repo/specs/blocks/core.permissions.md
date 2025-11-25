# Block: core.permissions

## 1. Purpose / Responsibility

Centralize access control logic:

- Define permission model (roles, capabilities)
- Evaluate whether a user can perform an action on a resource
- Provide simple, composable permission APIs to UI and backend layers

### Not Responsible For

- Storing users or roles (delegated to `core.auth` / backend)
- UI rendering of “forbidden” screens (delegated to `core.ui`)

---

## 2. High-Level Summary

`core.permissions` is the **policy brain** of the app.  
It understands:

- What actions exist (read/write project, manage comments, etc.)
- What resource types exist
- How user identity + claims map to allowed actions

Other blocks should **never** hardcode permission rules; they call into this block.

---

## 3. Modules in This Block

| Module                | Responsibility                                      | Status  |
|-----------------------|-----------------------------------------------------|---------|
| PermissionModel       | Types/enums for actions, resources, roles           | planned |
| PermissionService     | Core `can(user, action, resource)` engine           | planned |
| PolicyRegistry        | Registry of policies per resource type              | planned |
| PermissionGuards      | Convenience helpers for UI and routing              | planned |

---

## 4. Data Model

In-memory definitions:

- `Role` (e.g., OWNER, EDITOR, VIEWER)
- `Action` (PROJECT_READ, PROJECT_WRITE, FILE_UPLOAD, COMMENT_EDIT, etc.)
- `ResourceDescriptor`:
  - `type` (project, file, comment…)
  - `id`
  - `ownerId` / `projectId` etc.

Mappings between roles and capabilities are configuration-driven (from `core.foundation` config).

---

## 5. Interactions

**Called By**

- `core.ui` when deciding which buttons/menus to show
- `core.storage` or backend layers when enforcing write access
- Feature blocks (sketch, map, comments, etc.)

**Depends On**

- `core.foundation` for config and logging
- `core.auth` for current user identity/roles

Example API:

```ts
import { can } from '@/core/permissions/PermissionService';

if (can(currentUser, 'PROJECT_WRITE', { type: 'project', id })) {
  // allow editing
}
```

---

## 6. Events & Side Effects

- None for MVP beyond logging decisions (optional)
- Future: audit log events could be emitted here

---

## 7. External Dependencies

- None beyond internal blocks and runtime

---

## 8. MVP Scope

- Define core actions:
  - PROJECT_READ, PROJECT_WRITE
  - FILE_READ, FILE_WRITE
  - COMMENT_CREATE, COMMENT_EDIT, COMMENT_DELETE
- Implement simple role model (OWNER, EDITOR, VIEWER)
- Implement `can(user, action, resource)` with:
  - Role-based rules
  - Ownership check for some resources
- Provide minimal UI helpers:
  - `canProjectWrite(projectId)`
  - `useCan(action, resource)`
