# Module: core.auth.AuthSessionManager

## 1. Purpose
Manages login/logout/token refresh.

## 2. Types
~~~ts
export interface AuthSession {
  tokens: AuthTokens;
  user: AuthUserInfo;
}
~~~

## 3. Public API
~~~ts
export interface AuthSessionManager {
  login(req: LoginRequest): Promise<Result<AuthSession>>;
  logout(): Promise<Result<void>>;
  restoreSession(): Promise<Result<AuthSession | null>>;
  getCurrentSession(): AuthSession | null;
  refreshSession(): Promise<Result<AuthSession>>;
}

export function getAuthSessionManager(): AuthSessionManager;
~~~
