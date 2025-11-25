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

describe("core.permissions", () => {
  beforeAll(() => {
    initDefaultPolicies();
  });

  it("denies when unauthenticated and no permissions", () => {
    const ctx = makeCtx({ user: null });
    const service = getPermissionService();
    const decision = service.canWithReason(ctx, "PROJECT_READ", makeProjectResource("p1"));
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("NOT_AUTHENTICATED");
  });

  it("grants via project membership", () => {
    const ctx = makeCtx({
      user: { id: "u1", displayName: "User", roles: [] },
      projectMembership: {
        projectId: "p1",
        roleId: "OWNER",
        permissions: ["projects.read"],
      },
    });
    const service = getPermissionService();
    const decision = service.canWithReason(ctx, "PROJECT_READ", makeProjectResource("p1"));
    expect(decision.allowed).toBe(true);
    expect(decision.grantSource).toBe("project_membership");
  });

  it("grants via global permission", () => {
    const ctx = makeCtx({
      user: { id: "u1", displayName: "User", roles: [] },
      globalPermissions: ["projects.read"],
    });
    const service = getPermissionService();
    const decision = service.canWithReason(ctx, "PROJECT_READ", makeProjectResource("p1"));
    expect(decision.allowed).toBe(true);
    expect(decision.grantSource).toBe("global_permission");
  });

  it("grants via override permission", () => {
    const ctx = makeCtx({
      user: { id: "u1", displayName: "User", roles: [] },
      globalPermissions: ["projects.read.override"],
    });
    const service = getPermissionService();
    const decision = service.canWithReason(ctx, "PROJECT_READ", makeProjectResource("p2"));
    expect(decision.allowed).toBe(true);
    expect(decision.grantSource).toBe("override_permission");
  });

  it("denies when resource not in membership project", () => {
    const ctx = makeCtx({
      user: { id: "u1", displayName: "User", roles: [] },
      projectMembership: {
        projectId: "p1",
        roleId: "OWNER",
        permissions: ["projects.read"],
      },
    });
    const service = getPermissionService();
    const decision = service.canWithReason(ctx, "PROJECT_READ", makeProjectResource("other"));
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("RESOURCE_NOT_IN_PROJECT");
  });
});
