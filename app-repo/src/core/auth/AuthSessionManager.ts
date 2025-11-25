import type { Result } from "../foundation/CoreTypes";
import type { AuthTokens, AuthUserInfo, LoginRequest, AuthApiClient } from "./AuthApiClient";
import { getAuthApiClient } from "./AuthApiClient";

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
    globalAuthSessionManager = createDefaultAuthSessionManager(getAuthApiClient());
  }
  return globalAuthSessionManager;
}

export function setAuthSessionManager(manager: AuthSessionManager): void {
  globalAuthSessionManager = manager;
}

export function createDefaultAuthSessionManager(apiClient: AuthApiClient): AuthSessionManager {
  let currentSession: AuthSession | null = null;

  return {
    async login(req: LoginRequest): Promise<Result<AuthSession>> {
      const result = await apiClient.login(req);
      if (!result.ok) return result as Result<any>;
      currentSession = { tokens: result.value.tokens, user: result.value.user };
      return { ok: true, value: currentSession };
    },

    async logout(): Promise<Result<void>> {
      currentSession = null;
      return { ok: true, value: undefined };
    },

    async restoreSession(): Promise<Result<AuthSession | null>> {
      // MVP: no persistence yet, always return current in-memory session
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
