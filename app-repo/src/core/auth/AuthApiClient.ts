import type { Result } from "../foundation/CoreTypes";

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

export interface AuthApiClient {
  login(req: LoginRequest): Promise<Result<{ tokens: AuthTokens; user: AuthUserInfo }>>;
  refreshTokens(refreshToken: string): Promise<Result<AuthTokens>>;
  fetchCurrentUser(accessToken: string): Promise<Result<AuthUserInfo>>;
}

let globalAuthApiClient: AuthApiClient | undefined;

export function setAuthApiClient(client: AuthApiClient): void {
  globalAuthApiClient = client;
}

export function getAuthApiClient(): AuthApiClient {
  if (!globalAuthApiClient) {
    throw new Error("AuthApiClient has not been configured");
  }
  return globalAuthApiClient;
}
