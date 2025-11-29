# Module: core.auth.CurrentUserProvider

## Module ID
core.auth.CurrentUserProvider

## 1. Purpose

The `core.auth.CurrentUserProvider` module provides a **read-only view of the currently authenticated user** and simple helpers to check whether the app is authenticated.

It is responsible for:

- Exposing `CurrentUser` as a stable type for the rest of the application.
- Providing functions to get the current user and check authentication status.
- Hiding the details of how sessions and tokens are managed (`AuthSessionManager`).

## 2. Responsibilities and Non-Responsibilities

### Responsibilities

- Define (or import) the `CurrentUser` type:
  - `id`, `displayName`, optional `email`, and `roles: string[]`.
- Provide functions:
  - `getCurrentUser(): CurrentUser | null`
  - `isAuthenticated(): boolean`
- Delegate to `AuthSessionManager` (or equivalent) to read the current session’s user information.

### Non-Responsibilities

- Does **not** manage login/logout or tokens — that’s `AuthSessionManager` and `AuthApiClient`.
- Does **not** manage reactive auth state; that’s `AuthStateStore`.
- Does **not** implement permission checks; that’s `core.permissions`.

## 3. Public API

> Conceptual API; actual signatures live in
> `src/core/auth/CurrentUserProvider.ts` and `src/core/auth/CurrentUserTypes.ts`
> and must remain compatible.

### Types

- `interface CurrentUser {`
  - `id: string`
  - `displayName: string`
  - `email?: string`
  - `roles: string[]`
  - `}`

### Provider

Conceptually:

```ts
interface CurrentUserProvider {
  getCurrentUser(): CurrentUser | null;
  isAuthenticated(): boolean;
}

declare function getCurrentUserProvider(): CurrentUserProvider;
```

### Behavior

- `getCurrentUser()`:
  - Reads from `AuthSessionManager.getCurrentSession()` (or similar) and returns:
    - `session.user` mapped into `CurrentUser` if a session exists.
    - `null` if there is no current session.
- `isAuthenticated()`:
  - Returns `true` iff there is a current session (or a non-null `CurrentUser`).
  - Does not inspect tokens directly.

## 4. Internal Model and Invariants

### Invariants

- `CurrentUser` must remain coherent with `AuthUserInfo` from `AuthApiClient`:
  - Same fields, or a clear and documented mapping.
- The provider does not cache user state beyond what is held in `AuthSessionManager`:
  - It should treat AuthSessionManager as the source of truth for the current user.

### Relationship to other modules

- `CurrentUserProvider` is read-side only; all mutations happen via AuthSessionManager and `AuthStateStore` orchestration.
- It is a convenient facade for code that needs a simple auth check or to read the current user identity.

## 5. Planned vs Implemented

### Current status

- **Lifecycle status**: `Stable`
  - Implementation exists at `src/core/auth/CurrentUserProvider.ts` and `CurrentUserTypes.ts`.
  - Tests exist at `tests/core/currentUserProvider.test.ts`, using fake session managers to verify behavior.
  - The module has a small, clear surface and is unlikely to change frequently.

### Planned enhancements

- Additional helpers (e.g., `requireAuthenticatedUser()` that returns Result<CurrentUser>).
- Optional support for multi-tenant or multi-account contexts (e.g., tenantId) as the application evolves.

Any such changes must be reflected in this spec and the types in `CurrentUserTypes.ts`.

## 6. Dependencies

### Upstream dependencies

`CurrentUserProvider` depends on:

- `AuthSessionManager` (to obtain the current session).
- `CurrentUser` type definitions from `CurrentUserTypes`.

It MUST NOT depend on:

- `core.ui` or UI components.
- `core.permissions` (permissions depend on auth, not the other way around).
- Storage or DB modules.

### Downstream dependents

Expected consumers:

- UI components and hooks needing quick access to current user identity.
- `core.permissions`, which can use `CurrentUser.roles` as inputs into permission evaluation.
- Any other module that needs to know “who is the user?”.

## 7. Error Model

- `getCurrentUser()` returns `null` when no user is authenticated; it does not throw.
- `isAuthenticated()` returns a boolean and does not throw.

If additional methods are added (e.g., ones that must be used only in authenticated contexts), they may return `Result` to signal errors rather than throwing, and this spec must be updated accordingly.

## 8. Testing Strategy

Tests MUST cover:

- Behavior when there is no current session (getCurrentUser returns null, isAuthenticated returns false).
- Behavior when there is a valid session/user:
  - getCurrentUser returns the expected `CurrentUser` shape.
  - isAuthenticated returns true.
- Behavior when the underlying session manager is replaced or mocked (ensuring the provider follows it).

Existing tests (`tests/core/currentUserProvider.test.ts`) already exercise these cases using fake session managers.

## 9. Performance Considerations

- The provider is a thin wrapper; calls are O(1) and trivial in cost.
- No caching beyond what AuthSessionManager holds.

No specific performance budget is needed for this module.

## 10. CI / Governance Integration

Any change to:

- The `CurrentUser` shape.
- The semantics of `getCurrentUser` or `isAuthenticated`.
- The relationship between CurrentUserProvider and AuthSessionManager.

MUST:

1. Update this spec.
2. Update implementations in `src/core/auth/CurrentUserProvider.ts` and `CurrentUserTypes.ts`.
3. Update tests in `tests/core/currentUserProvider.test.ts`.
4. Keep the `core.auth` block spec and inventory notes in sync.
5. Ensure `npm run spec:check` passes from the monorepo root.

AI agents and humans MUST treat `CurrentUser` as a core identity contract used by both `core.auth` and `core.permissions`, and evolve it carefully.
