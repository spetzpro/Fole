# Module: core.auth.CurrentUserProvider

## 1. Purpose
Read-only access to current user.

## 2. Types
~~~ts
export interface CurrentUser {
  id: string;
  displayName: string;
  email?: string;
  roles: string[];
}
~~~

## 3. Public API
~~~ts
export interface CurrentUserProvider {
  getCurrentUser(): CurrentUser | null;
  isAuthenticated(): boolean;
}

export function getCurrentUserProvider(): CurrentUserProvider;
~~~
