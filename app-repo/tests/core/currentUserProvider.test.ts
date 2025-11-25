import { createDefaultCurrentUserProvider } from "../../src/core/auth/CurrentUserProvider";
import type { AuthSessionManager, AuthSession } from "../../src/core/auth/AuthSessionManager";

class FakeSessionManager implements AuthSessionManager {
  private session: AuthSession | null = {
    tokens: { accessToken: "a", refreshToken: "r", expiresAt: new Date().toISOString() },
    user: { id: "u1", displayName: "User", roles: [] },
  };

  async login(): Promise<any> { return { ok: true, value: this.session }; }
  async logout(): Promise<any> { this.session = null; return { ok: true, value: undefined }; }
  async restoreSession(): Promise<any> { return { ok: true, value: this.session }; }
  getCurrentSession(): AuthSession | null { return this.session; }
  async refreshSession(): Promise<any> { return { ok: true, value: this.session! }; }
}

async function run() {
  const provider = createDefaultCurrentUserProvider(new FakeSessionManager());

  if (!provider.isAuthenticated()) throw new Error("Expected authenticated");
  const user = provider.getCurrentUser();
  if (!user || user.id !== "u1") throw new Error("Unexpected current user");

  console.log("currentUserProvider tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
