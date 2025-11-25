# Module: core.auth.AuthStateStore

## 1. Purpose
Reactive auth state for UI.

## 2. Types
~~~ts
export type AuthStatus = "unauthenticated" | "authenticating" | "authenticated" | "error";

export interface AuthState {
  status: AuthStatus;
  user: CurrentUser | null;
  lastError?: string;
}
~~~

## 3. Public API
~~~ts
export type AuthStateListener = (state: AuthState) => void;

export interface AuthStateStore {
  getState(): AuthState;
  subscribe(listener: AuthStateListener): () => void;
  setState(next: AuthState): void;
}

export function getAuthStateStore(): AuthStateStore;
~~~
