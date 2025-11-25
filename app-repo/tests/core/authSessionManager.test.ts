import { setAuthApiClient, type AuthApiClient, type AuthTokens, type AuthUserInfo } from "../../src/core/auth/AuthApiClient";
import { createDefaultAuthSessionManager } from "../../src/core/auth/AuthSessionManager";

const fakeTokens: AuthTokens = {
  accessToken: "access-1",
  refreshToken: "refresh-1",
  expiresAt: new Date().toISOString(),
};

const fakeUser: AuthUserInfo = {
  id: "user-1",
  displayName: "Test User",
  roles: ["user"],
};

class FakeAuthApiClient implements AuthApiClient {
  async login(): Promise<any> {
    return { ok: true, value: { tokens: fakeTokens, user: fakeUser } };
  }
  async refreshTokens(): Promise<any> {
    return { ok: true, value: fakeTokens };
  }
  async fetchCurrentUser(): Promise<any> {
    return { ok: true, value: fakeUser };
  }
}

async function run() {
  setAuthApiClient(new FakeAuthApiClient());
  const manager = createDefaultAuthSessionManager(new FakeAuthApiClient());

  const loginResult = await manager.login({ username: "x", password: "y" });
  if (!loginResult.ok) throw new Error("login failed");

  if (!manager.getCurrentSession()) throw new Error("session not set after login");

  const refreshResult = await manager.refreshSession();
  if (!refreshResult.ok) throw new Error("refreshSession failed");

  const restoreResult = await manager.restoreSession();
  if (!restoreResult.ok) throw new Error("restoreSession failed");

  const logoutResult = await manager.logout();
  if (!logoutResult.ok) throw new Error("logout failed");

  console.log("authSessionManager tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
