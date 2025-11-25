# Module: core.auth.AuthApiClient

## 1. Purpose
Low-level HTTP calls to the auth backend.

## 2. Responsibilities
- login
- refreshTokens
- fetchCurrentUser

## 3. Types
~~~ts
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export interface AuthUserInfo {
  id: string;
  displayName: string;
  email?: string;
  roles: string[];
}

export interface LoginRequest {
  username: string;
  password: string;
}
~~~

## 4. Public API
~~~ts
export interface AuthApiClient {
  login(req: LoginRequest): Promise<Result<{ tokens: AuthTokens; user: AuthUserInfo }>>;
  refreshTokens(refreshToken: string): Promise<Result<AuthTokens>>;
  fetchCurrentUser(accessToken: string): Promise<Result<AuthUserInfo>>;
}

export function getAuthApiClient(): AuthApiClient;
~~~
