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
import type { AuthSession, AuthSessionManager } from "@/core/auth/AuthSessionManager";
import { createDefaultCurrentUserProvider, setCurrentUserProvider } from "@/core/auth/CurrentUserProvider";

class FakeCurrentUserProvider {
  constructor(private user: CurrentUser | null) {}

  setUser(user: CurrentUser | null): void {
    this.user = user;
  }

  getCurrentUser(): CurrentUser | null {
    return this.user;
  }

  isAuthenticated(): boolean {
    return this.user !== null;
  }
}

class FakeSessionManager implements AuthSessionManager {
  constructor(private session: AuthSession | null) {}

  setSession(session: AuthSession | null): void {
    this.session = session;
  }

  async login(_req?: any): Promise<any> {
    return { ok: true, value: this.session };
  }

  async logout(): Promise<any> {
    this.session = null;
    return { ok: true, value: undefined };
  }

  async restoreSession(): Promise<any> {
    return { ok: true, value: this.session };
  }

  getCurrentSession(): AuthSession | null {
    return this.session;
  }

  async refreshSession(): Promise<any> {
    return { ok: true, value: this.session };
  }
}

function makeProjectResource(projectId: string): ResourceDescriptor {
  return { type: "project", id: projectId, projectId };
}

function makeMapResource(projectId: string, mapId: string): ResourceDescriptor {
  return { type: "map", id: mapId, projectId };
}

describe("PermissionGuards", () => {
  const emptyProvider = new FakeCurrentUserProvider(null);

  beforeAll(() => {
    initDefaultPolicies();
  });

  afterEach(() => {
    setCurrentUserProvider(emptyProvider);
  });

  it("canPerform returns false when there is no current user", () => {
    setCurrentUserProvider(emptyProvider);
    const allowed = canPerform("PROJECT_READ", makeProjectResource("p1"));
    expect(allowed).toBe(false);
  });

  it("canPerform returns true when role grants the action", () => {
    const provider = new FakeCurrentUserProvider({
      id: "u-owner",
      displayName: "Owner User",
      roles: ["OWNER"],
    });
    setCurrentUserProvider(provider);

    const allowed = canPerform("PROJECT_EXPORT", makeProjectResource("p1"));
    expect(allowed).toBe(true);
  });

  it("ensureCanPerform returns PERMISSION_DENIED AppError with NOT_AUTHENTICATED", () => {
    setCurrentUserProvider(emptyProvider);
    const result = ensureCanPerform("PROJECT_READ", makeProjectResource("p1"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PERMISSION_DENIED");
      expect(result.error.details).toBeDefined();
      expect((result.error.details as any).reasonCode).toBe("NOT_AUTHENTICATED");
      expect((result.error.details as any).grantSource).toBeUndefined();
    }
  });

  it("ensureCanPerform returns INSUFFICIENT_ROLE when permissions are missing", () => {
    const provider = new FakeCurrentUserProvider({
      id: "u-viewer",
      displayName: "Viewer User",
      roles: ["VIEWER"],
    });
    setCurrentUserProvider(provider);

    const result = ensureCanPerform("PROJECT_WRITE", makeProjectResource("p1"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PERMISSION_DENIED");
      expect((result.error.details as any).reasonCode).toBe("INSUFFICIENT_ROLE");
      expect((result.error.details as any).grantSource).toBeUndefined();
    }
  });

  it("assertCanPerform throws AppError with reasonCode", () => {
    const provider = new FakeCurrentUserProvider({
      id: "u-viewer",
      displayName: "Viewer User",
      roles: ["VIEWER"],
    });
    setCurrentUserProvider(provider);

    try {
      assertCanPerform("PROJECT_WRITE", makeProjectResource("p1"));
      throw new Error("Expected assertCanPerform to throw");
    } catch (err: any) {
      expect(err.code).toBe("PERMISSION_DENIED");
      expect(err.details?.reasonCode).toBe("INSUFFICIENT_ROLE");
      expect(err.details?.grantSource).toBeUndefined();
    }
  });

  it("createPermissionContextFromCurrentUser produces policy grantSource", () => {
    const provider = new FakeCurrentUserProvider({
      id: "u-editor",
      displayName: "Editor User",
      roles: ["EDITOR"],
    });
    setCurrentUserProvider(provider);

    const ctx = createPermissionContextFromCurrentUser();
    const service = getPermissionService();
    const decision = service.canWithReason(ctx, "PROJECT_WRITE", makeProjectResource("p1"));
    expect(decision.allowed).toBe(true);
    expect(decision.grantSource).toBe("global_permission");
  });

  it("role changes are reflected in guard checks", () => {
    const provider = new FakeCurrentUserProvider({
      id: "u-changing",
      displayName: "Changing User",
      roles: ["VIEWER"],
    });
    setCurrentUserProvider(provider);

    expect(canPerform("PROJECT_WRITE", makeProjectResource("p1"))).toBe(false);

    provider.setUser({
      id: "u-changing",
      displayName: "Changing User",
      roles: ["EDITOR"],
    });

    expect(canPerform("PROJECT_WRITE", makeProjectResource("p1"))).toBe(true);
  });

  it("logout/session invalidation removes access", () => {
    const sessionManager = new FakeSessionManager({
      tokens: { accessToken: "a", refreshToken: "r", expiresAt: new Date().toISOString() },
      user: { id: "u-logout", displayName: "Logout User", roles: ["EDITOR"] },
    });
    const provider = createDefaultCurrentUserProvider(sessionManager);
    setCurrentUserProvider(provider);

    expect(canPerform("PROJECT_WRITE", makeProjectResource("p1"))).toBe(true);

    sessionManager.setSession(null);
    expect(canPerform("PROJECT_WRITE", makeProjectResource("p1"))).toBe(false);
  });

  it("expired or missing session results in no access", () => {
    const sessionManager = new FakeSessionManager(null);
    const provider = createDefaultCurrentUserProvider(sessionManager);
    setCurrentUserProvider(provider);

    expect(canPerform("PROJECT_READ", makeProjectResource("p1"))).toBe(false);
  });
});
