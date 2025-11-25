import { initDefaultPolicies } from "../../src/core/permissions/PolicyRegistry";
import { getPermissionService } from "../../src/core/permissions/PermissionService";
import type {
  PermissionContext,
  ResourceDescriptor,
} from "../../src/core/permissions/PermissionModel";

function makeCtx(partial: Partial<PermissionContext>): PermissionContext {
  return {
    user: null,
    globalPermissions: [],
    ...partial,
  } as PermissionContext;
}

function makeProjectResource(projectId: string): ResourceDescriptor {
  return { type: "project", id: projectId, projectId };
}

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function runPermissionsTests(): void {
  initDefaultPolicies();

  const service = getPermissionService();

  // denies when unauthenticated and no permissions
  {
    const ctx = makeCtx({ user: null });
    const decision = service.canWithReason(
      ctx,
      "PROJECT_READ",
      makeProjectResource("p1")
    );
    assert(!decision.allowed, "Expected unauthenticated user to be denied");
    assert(
      decision.reasonCode === "NOT_AUTHENTICATED",
      `Expected reason NOT_AUTHENTICATED, got ${decision.reasonCode}`
    );
  }

  // grants via project membership
  {
    const ctx = makeCtx({
      user: { id: "u1", displayName: "User", roles: [] },
      projectMembership: {
        projectId: "p1",
        roleId: "OWNER",
        permissions: ["projects.read"],
      },
    });

    const decision = service.canWithReason(
      ctx,
      "PROJECT_READ",
      makeProjectResource("p1")
    );
    assert(decision.allowed, "Expected project membership to allow access");
    assert(
      decision.grantSource === "project_membership",
      `Expected grantSource project_membership, got ${decision.grantSource}`
    );
  }

  // grants via global permission
  {
    const ctx = makeCtx({
      user: { id: "u1", displayName: "User", roles: [] },
      globalPermissions: ["projects.read"],
    });

    const decision = service.canWithReason(
      ctx,
      "PROJECT_READ",
      makeProjectResource("p1")
    );
    assert(decision.allowed, "Expected global permission to allow access");
    assert(
      decision.grantSource === "global_permission",
      `Expected grantSource global_permission, got ${decision.grantSource}`
    );
  }

  // grants via override permission
  {
    const ctx = makeCtx({
      user: { id: "u1", displayName: "User", roles: [] },
      globalPermissions: ["projects.read.override"],
    });

    const decision = service.canWithReason(
      ctx,
      "PROJECT_READ",
      makeProjectResource("p2")
    );
    assert(decision.allowed, "Expected override permission to allow access");
    assert(
      decision.grantSource === "override_permission",
      `Expected grantSource override_permission, got ${decision.grantSource}`
    );
  }

  // denies when resource not in membership project
  {
    const ctx = makeCtx({
      user: { id: "u1", displayName: "User", roles: [] },
      projectMembership: {
        projectId: "p1",
        roleId: "OWNER",
        permissions: ["projects.read"],
      },
    });

    const decision = service.canWithReason(
      ctx,
      "PROJECT_READ",
      makeProjectResource("other")
    );
    assert(
      !decision.allowed,
      "Expected access to be denied for mismatched projectId"
    );
    assert(
      decision.reasonCode === "RESOURCE_NOT_IN_PROJECT",
      `Expected reason RESOURCE_NOT_IN_PROJECT, got ${decision.reasonCode}`
    );
  }
}

runPermissionsTests();

