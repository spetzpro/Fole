import type { CurrentUser } from "./CurrentUserTypes";
import type { AuthSessionManager } from "./AuthSessionManager";
import { getAuthSessionManager } from "./AuthSessionManager";

export interface CurrentUserProvider {
  getCurrentUser(): CurrentUser | null;
  isAuthenticated(): boolean;
}

let globalCurrentUserProvider: CurrentUserProvider | undefined;

export function getCurrentUserProvider(): CurrentUserProvider {
  if (!globalCurrentUserProvider) {
    globalCurrentUserProvider = createDefaultCurrentUserProvider(getAuthSessionManager());
  }
  return globalCurrentUserProvider;
}

export function setCurrentUserProvider(provider: CurrentUserProvider): void {
  globalCurrentUserProvider = provider;
}

export function createDefaultCurrentUserProvider(sessionManager: AuthSessionManager): CurrentUserProvider {
  return {
    getCurrentUser(): CurrentUser | null {
      const session = sessionManager.getCurrentSession();
      if (!session) return null;
      return {
        id: session.user.id,
        displayName: session.user.displayName,
        email: session.user.email,
        roles: session.user.roles,
      };
    },
    isAuthenticated(): boolean {
      return sessionManager.getCurrentSession() !== null;
    },
  };
}
