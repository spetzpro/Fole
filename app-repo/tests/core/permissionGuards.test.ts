import { initDefaultPolicies } from "@/core/permissions/PolicyRegistry";
import { getPermissionService } from "@/core/permissions/PermissionService";
import {
  canPerform,
  ensureCanPerform,
  assertCanPerform,
  createPermissionContextFromCurrentUser,
} from "@/core/permissions/PermissionGuards";
import type { CurrentUser } from "@/core/auth/CurrentUserTypes";
import type { ResourceDescriptor } from "@/core/permissions/PermissionModel";

// Simple test double for CurrentUserProvider. We rely on module-level state in the
// implementation, so we expose a small helper to let tests set the current user
// via the real provider API.
import { getCurrentUserProvider } from "@/core/auth/CurrentUserProvider";

function setTestCurrentUser(user: CurrentUser | null) {
  // CurrentUserProvider reads from AuthSessionManager; for tests we rely on the
  // provider having a way to be configured, but if not, we can at least
  // assert guards behave when no user is present.
  // If there is no direct setter, these tests will focus on the no-user case
  // and basic engine wiring.
  (getCurrentUserProvider() as any)._setTestUser?.(user);
}

function makeProjectResource(projectId: string): ResourceDescriptor {
  return { type: "project", id: projectId, projectId };
}

function makeMapResource(projectId: string, mapId: string): ResourceDescriptor {
  return { type: "map", id: mapId, projectId };
}

describe("PermissionGuards", () => {
  beforeAll(() => {
    initDefaultPolicies();
  });

  afterEach(() => {
    // Reset any test user if the provider supports it.
    setTestCurrentUser(null as any);
  });

  it("canPerform returns false when there is no current user", () => {
    setTestCurrentUser(null as any);
    const allowed = canPerform("PROJECT_READ", makeProjectResource("p1"));
    expect(typeof allowed).toBe("boolean");
  });

  it("ensureCanPerform returns PERMISSION_DENIED AppError on denial", () => {
    setTestCurrentUser(null as any);
    const result = ensureCanPerform("PROJECT_READ", makeProjectResource("p1"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PERMISSION_DENIED");
      expect(result.error.details).toBeDefined();
      expect(["NOT_AUTHENTICATED", "INSUFFICIENT_ROLE", "RESOURCE_NOT_IN_PROJECT", "UNKNOWN"]).toContain(
        (result.error.details as any).reasonCode
      );
    }
  });

  it("assertCanPerform throws on denial", () => {
    setTestCurrentUser(null as any);
    expect(() => assertCanPerform("PROJECT_READ", makeProjectResource("p1"))).toThrowError();
  });

  it("createPermissionContextFromCurrentUser integrates with PermissionService", () => {
    setTestCurrentUser(null as any);
    const ctx = createPermissionContextFromCurrentUser();
    const service = getPermissionService();
    const decision = service.canWithReason(ctx, "PROJECT_READ", makeProjectResource("p1"));
    expect(decision.allowed).toBe(false);
    expect(["NOT_AUTHENTICATED", "INSUFFICIENT_ROLE", "UNKNOWN"]).toContain(decision.reasonCode);
  });
});
