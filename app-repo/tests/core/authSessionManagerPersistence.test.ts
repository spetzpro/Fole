import { createDefaultAuthSessionManager } from "@/core/auth/AuthSessionManager";
import type { AuthApiClient, AuthTokens, AuthUserInfo, LoginRequest } from "@/core/auth/AuthApiClient";
import type { SessionStore, PersistedSession } from "@/core/auth/SessionStore";

interface TestResult<T> {
  ok: boolean;
  value?: T;
  error?: { code: string; message: string };
}

function createFakeAuthApiClient(sessionToReturn: { tokens: AuthTokens; user: AuthUserInfo } | null): AuthApiClient {
  return {
    async login(_req: LoginRequest): Promise<TestResult<{ tokens: AuthTokens; user: AuthUserInfo }>> {
      if (!sessionToReturn) {
        return { ok: false, error: { code: "AUTH_LOGIN_FAILED", message: "failed" } };
      }
      return { ok: true, value: sessionToReturn };
    },
    async refreshTokens(_refreshToken: string): Promise<TestResult<AuthTokens>> {
      if (!sessionToReturn) {
        return { ok: false, error: { code: "AUTH_REFRESH_FAILED", message: "failed" } };
      }
      return { ok: true, value: sessionToReturn.tokens };
    },
    async fetchCurrentUser(_accessToken: string): Promise<TestResult<AuthUserInfo>> {
      if (!sessionToReturn) {
        return { ok: false, error: { code: "AUTH_ME_FAILED", message: "failed" } };
      }
      return { ok: true, value: sessionToReturn.user };
    },
  };
}

function createFakeSessionStore(): { store: SessionStore; state: { persisted: PersistedSession | null; saveCalls: number; clearCalls: number } } {
  const state = { persisted: null as PersistedSession | null, saveCalls: 0, clearCalls: 0 };
  const store: SessionStore = {
    async load(): Promise<PersistedSession | null> {
      return state.persisted;
    },
    async save(session: PersistedSession): Promise<void> {
      state.persisted = session;
      state.saveCalls += 1;
    },
    async clear(): Promise<void> {
      state.persisted = null;
      state.clearCalls += 1;
    },
  };
  return { store, state };
}

const baseTokens: AuthTokens = {
  accessToken: "access-1",
  refreshToken: "refresh-1",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

const baseUser: AuthUserInfo = {
  id: "user-1",
  displayName: "User 1",
  email: "user1@example.com",
  roles: ["VIEWER"],
};

describe("AuthSessionManager persistence", () => {
  it("login persists session via SessionStore", async () => {
    const { store, state } = createFakeSessionStore();
    const apiClient = createFakeAuthApiClient({ tokens: baseTokens, user: baseUser });
    const manager = createDefaultAuthSessionManager(apiClient as any, store);

    const result = await manager.login({ username: "u", password: "p" });
    expect(result.ok).toBe(true);
    expect(manager.getCurrentSession()).not.toBeNull();
    expect(state.saveCalls).toBe(1);
    expect(state.persisted).not.toBeNull();
    expect(state.persisted!.tokens.accessToken).toBe(baseTokens.accessToken);
    expect(state.persisted!.user.id).toBe(baseUser.id);
  });

  it("logout clears session and store", async () => {
    const { store, state } = createFakeSessionStore();
    const apiClient = createFakeAuthApiClient({ tokens: baseTokens, user: baseUser });
    const manager = createDefaultAuthSessionManager(apiClient as any, store);

    await manager.login({ username: "u", password: "p" });
    expect(manager.getCurrentSession()).not.toBeNull();

    const result = await manager.logout();
    expect(result.ok).toBe(true);
    expect(manager.getCurrentSession()).toBeNull();
    expect(state.clearCalls).toBe(1);
    expect(state.persisted).toBeNull();
  });

  it("restoreSession rehydrates currentSession when store has data", async () => {
    const { store, state } = createFakeSessionStore();
    state.persisted = {
      tokens: baseTokens,
      user: baseUser,
      persistedAt: new Date().toISOString(),
    };

    const apiClient = createFakeAuthApiClient({ tokens: baseTokens, user: baseUser });
    const manager = createDefaultAuthSessionManager(apiClient as any, store);

    const result = await manager.restoreSession();
    expect(result.ok).toBe(true);
    expect(result.value).not.toBeNull();
    expect(result.value!.user.id).toBe(baseUser.id);
    const current = manager.getCurrentSession();
    expect(current).not.toBeNull();
    expect(current!.user.id).toBe(baseUser.id);
  });

  it("restoreSession returns null and clears store when expired", async () => {
    const { store, state } = createFakeSessionStore();
    state.persisted = {
      tokens: {
        ...baseTokens,
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      },
      user: baseUser,
      persistedAt: new Date().toISOString(),
    };

    const apiClient = createFakeAuthApiClient({ tokens: baseTokens, user: baseUser });
    const manager = createDefaultAuthSessionManager(apiClient as any, store);

    const result = await manager.restoreSession();
    expect(result.ok).toBe(true);
    expect(result.value).toBeNull();
    expect(manager.getCurrentSession()).toBeNull();
    expect(state.persisted).toBeNull();
    expect(state.clearCalls).toBe(1);
  });
});
