# Module Specification: feature.projects

## Module ID
feature.projects

## Purpose
Provides project-registry and project-membership management surfaces used by sysadmin workflows, while delegating storage and permission decisions to core modules.

## Related Specs

- `specs/core/_AI_STORAGE_ARCHITECTURE.md` – canonical storage root, project folder layout, and project-scoped persistence boundaries.
- `specs/core/_AI_ROLES_AND_PERMISSIONS.md` – canonical role and action model for project read/write authorization.
- `specs/modules/core.storage/core.storage.ProjectRegistry.md` – registry creation/listing primitives.
- `specs/modules/core.permissions/core.permissions.PermissionService.md` – permission evaluation and denial semantics.

## State Shape
```ts
{
  projects: {
    items: Array<{
      id: string;
      name: string;
      createdAt: string;
      updatedAt: string;
    }>;
  };
  memberships: {
    [projectId: string]: Array<{
      userId: string;
      role: 'OWNER' | 'MAINTAINER' | 'CONTRIBUTOR' | 'VIEWER';
      createdAt?: string;
      updatedAt?: string;
    }>;
  };
}
```

## Blocks
- ProjectsRegistryApi: list projects, create project, and fetch a single project summary by id.
- ProjectMembershipApi: list, add/update, and remove project memberships.
- ProjectsPermissionGate: enforce `PROJECT_READ`/`PROJECT_WRITE` decisions through core.permissions.

## Lifecycle
- Project creation: creates a new project folder/metadata and a project database with required migrations.
- Membership mutation: add/update writes role for target user in the project membership table; remove deletes that membership row.
- Membership read: reads normalized membership rows for an authorized caller.

## Dependencies
- core.storage (ProjectRegistry and project path/model services)
- core.permissions (PermissionService, permission actions, and membership-aware permission context)
- core.auth (current user resolution)

## Error Model
- PermissionDeniedError: caller lacks required action for the target project/operation.
- ValidationError: malformed project id, name, or membership payload.
- NotFoundError: project id does not resolve to an existing registry entry.
- ConflictError: operation collides with storage or data constraints.

## MVP Implementation Status (HTTP + Sysadmin)

Current MVP delivers the following HTTP endpoints:

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:projectId`
- `GET /api/projects/:projectId/members`
- `POST /api/projects/:projectId/members`
- `DELETE /api/projects/:projectId/members/:memberUserIdOrEmail`
- `GET /api/projects/:projectId/effective-permissions`

Current MVP Sysadmin UI adds:

- Projects registry list + refresh.
- Project create form.
- Project member list + add/update + remove.

All operations follow the existing response envelope (`{ ok, data?, error? }`) and preserve canonical permission-denied shape from shared API error handling.

## Explicit v1 Non-Goals

- No project archive endpoint in v1.
- No project delete endpoint in v1.
- No archive/delete controls in Sysadmin Projects or Observability UI for v1.
- No new permission identifiers for lifecycle operations in v1.

## Test Matrix
- Registry flows: create then list includes created project.
- Membership flows: add/update role, list includes member, remove excludes member.
- Authorization: write endpoints deny callers without project write capability.
- Effective permissions observability: authorized caller sees computed project permissions; unauthorized caller receives permission-denied response without permissions payload.
- Validation: invalid payloads return structured bad-request style responses.
