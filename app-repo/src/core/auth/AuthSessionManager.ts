import type { Result } from "../foundation/CoreTypes";
import type { AuthTokens, AuthUserInfo, LoginRequest, AuthApiClient } from "./AuthApiClient";
import { getAuthApiClient } from "./AuthApiClient";
import type { PersistedSession, SessionStore } from "./SessionStore";
import { getSessionStore } from "./SessionStore";

export interface AuthSession {
  tokens: AuthTokens;
  user: AuthUserInfo;
}

export interface AuthSessionManager {
  login(req: LoginRequest): Promise<Result<AuthSession>>;
  logout(): Promise<Result<void>>;
  restoreSession(): Promise<Result<AuthSession | null>>;
  getCurrentSession(): AuthSession | null;
  refreshSession(): Promise<Result<AuthSession>>;
}

let globalAuthSessionManager: AuthSessionManager | undefined;

export function getAuthSessionManager(): AuthSessionManager {
  if (!globalAuthSessionManager) {
    globalAuthSessionManager = createDefaultAuthSessionManager(getAuthApiClient(), getSessionStore());
  }
  return globalAuthSessionManager;
}

export function setAuthSessionManager(manager: AuthSessionManager): void {
  globalAuthSessionManager = manager;
}

export function createDefaultAuthSessionManager(apiClient: AuthApiClient, sessionStore: SessionStore): AuthSessionManager {
  let currentSession: AuthSession | null = null;

  return {
    async login(req: LoginRequest): Promise<Result<AuthSession>> {
      const result = await apiClient.login(req);
      if (!result.ok) return result as Result<any>;
      currentSession = { tokens: result.value.tokens, user: result.value.user };
      const persisted: PersistedSession = {
        tokens: currentSession.tokens,
        user: currentSession.user,
        persistedAt: new Date().toISOString(),
      };
      await sessionStore.save(persisted);
      return { ok: true, value: currentSession };
    },

    async logout(): Promise<Result<void>> {
      currentSession = null;
      await sessionStore.clear();
      return { ok: true, value: undefined };
    },

    async restoreSession(): Promise<Result<AuthSession | null>> {
      const persisted = await sessionStore.load();
      if (!persisted) {
        currentSession = null;
        return { ok: true, value: null };
      }

      const expiresAt = persisted.tokens.expiresAt;
      if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
        await sessionStore.clear();
        currentSession = null;
        return { ok: true, value: null };
      }

      currentSession = { tokens: persisted.tokens, user: persisted.user };
      return { ok: true, value: currentSession };
    },

    getCurrentSession(): AuthSession | null {
      return currentSession;
    },

    async refreshSession(): Promise<Result<AuthSession>> {
      if (!currentSession) {
        return {
          ok: false,
          error: {
            code: "NO_SESSION",
            message: "No session to refresh",
          },
        };
      }
      const result = await apiClient.refreshTokens(currentSession.tokens.refreshToken);
      if (!result.ok) return result as Result<any>;
      currentSession = { tokens: result.value, user: currentSession.user };
      return { ok: true, value: currentSession };
    },
  };
}
