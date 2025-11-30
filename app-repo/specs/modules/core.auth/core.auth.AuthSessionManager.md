# Module: core.auth.AuthSessionManager

## Module ID
core.auth.AuthSessionManager

## 1. Purpose

The `core.auth.AuthSessionManager` module orchestrates **login, logout, refresh, and session tracking** for the application.

It is responsible for:

- Calling `AuthApiClient` to perform login and token refresh.
- Holding the current `AuthSession` in memory.
- Coordinating with a pluggable `SessionStore` abstraction for optional persistence.
- Providing convenient functions to query and update the current session.
- Serving as the central place for auth flows used by UI and other blocks.

## 2. Responsibilities and Non-Responsibilities

### Responsibilities

- Define the `AuthSession` type:
  - `{ tokens: AuthTokens; user: AuthUserInfo }` (or mapped `CurrentUser` equivalent).
- Implement:
  - `login(req: LoginRequest): Promise<Result<AuthSession>>`
  - `logout(): Promise<Result<void>>`
  - `restoreSession(): Promise<Result<AuthSession | null>>`
  - `getCurrentSession(): AuthSession | null`
  - `refreshSession(): Promise<Result<AuthSession>>`
- Maintain an in-memory reference to the current session (if any) and persist/clear it via `SessionStore`.

### Non-Responsibilities

- Does **not** persist sessions across application restarts in the MVP:
  - `restoreSession` is currently a no-op or returns `null` (depending on implementation).
- Does **not** expose UI-facing auth state directly — that’s `AuthStateStore` / `CurrentUserProvider`.
- Does **not** implement permissions — that’s `core.permissions`.
- Does **not** decide how UI should react to auth changes (redirects, modals, etc.).

## 3. Public API

> Conceptual API; actual signatures live in
> `src/core/auth/AuthSessionManager.ts` and must remain compatible.

### Types

- `type AuthSession = {`
  - `tokens: AuthTokens`
  - `user: AuthUserInfo`
  - `}`

### Interface

Conceptually:

```ts
interface AuthSessionManager {
  login(req: LoginRequest): Promise<Result<AuthSession>>;
  logout(): Promise<Result<void>>;
  restoreSession(): Promise<Result<AuthSession | null>>;
  getCurrentSession(): AuthSession | null;
  refreshSession(): Promise<Result<AuthSession>>;
}

declare function getAuthSessionManager(): AuthSessionManager;
```

### Behavior (MVP)

- `login`:
  - Calls `AuthApiClient.login(req)`.
  - On success, stores the resulting `AuthSession` in memory, persists it via `SessionStore.save`, and returns `Ok<AuthSession>`.
  - On failure, returns `Err` with an appropriate code (e.g., `AUTH_LOGIN_FAILED`).

- `logout`:
  - Clears the in-memory session, clears any persisted session state via `SessionStore.clear`, and returns `Ok<void>`.
  - Does not yet inform a backend logout endpoint (MVP); that may be added later.

- `getCurrentSession`:
  - Returns the in-memory `AuthSession` or `null` if not logged in.

- `restoreSession`:
  - Calls `SessionStore.load()` to attempt to restore a previously persisted session.
  - If a session is found and `tokens.expiresAt` is still valid, rehydrates `currentSession` from the stored tokens and user and returns `Ok<AuthSession>`.
  - If no session is found or the stored session is expired, clears `currentSession`, ensures any persisted state is cleared, and returns `Ok<null>`.

- `refreshSession`:
  - If there is no current session or refresh token, returns an `Err` result.
  - If there is a session, calls `AuthApiClient.refreshTokens(refreshToken)` and updates the in-memory session with new tokens on success.

## 4. Internal Model and Invariants

### Invariants

- At most one active session at a time:
  - Logging in replaces any existing session.
- `getCurrentSession()` is the canonical in-process view of the current session.
- When a `SessionStore` is configured, `login`/`logout`/`restoreSession` keep in-memory and persisted session state logically in sync.

### Phase 1 persistence

- Session persistence is mediated by a pluggable `SessionStore` abstraction.
- The default `SessionStore` implementation remains in-memory only, so sessions are not persisted across process restarts unless the host app provides a concrete persistent store.

## 5. Planned vs Implemented

### Current status

- **Lifecycle status**: `Implemented` (MVP)
  - An in-memory implementation exists at `src/core/auth/AuthSessionManager.ts`.
  - Tests exist at `tests/core/authSessionManager.test.ts`, using fake `AuthApiClient` implementations.
  - Flows tested include login, retrieval of current session, refresh behavior, restore (MVP), and logout.

### Planned enhancements

- Durable session persistence and robust `restoreSession` behavior.
- Optional backend logout endpoint integration.
- More nuanced refresh policies (e.g., pre-emptive refresh, handling expiry windows).

## 6. Dependencies

### Upstream dependencies

`AuthSessionManager` depends on:

- `core.auth.AuthApiClient` for login and refresh calls.
- Shared types (`AuthTokens`, `AuthUserInfo`, `LoginRequest`) as defined by `AuthApiClient`.

It MUST NOT depend on:

- `core.ui` — to avoid circular dependencies.
- `feature.*` modules.

It MAY interact with:

- `AuthStateStore` and `CurrentUserProvider` indirectly (via orchestration code that syncs state), but it does not depend on them in its core contract.

### Downstream dependents

Expected consumers:

- `CurrentUserProvider`, which uses session.user to derive `CurrentUser`.
- Higher-level orchestration code that propagates session changes into `AuthStateStore`.
- Any code that needs to perform auth flows imperatively.

## 7. Error Model

All methods that can fail (login, logout, restoreSession, refreshSession) return `Result`:

- On success: `Ok<T>`.
- On failure: `Err` with error codes such as:
  - `AUTH_LOGIN_FAILED`
  - `AUTH_REFRESH_FAILED`
  - `AUTH_NO_SESSION`
  - `AUTH_RESTORE_FAILED` (future, when persistence is added)

These codes should be documented in the implementation and tests. Expected auth failures (e.g., bad credentials) must not throw; unexpected programming errors may throw but should be rare.

## 8. Testing Strategy

Tests MUST cover:

- Happy-path login:
  - Successful login stores a session and `getCurrentSession` returns it.
- Logout:
  - Clears session; subsequent `getCurrentSession` returns null.
- Refresh:
  - With an active session, refresh calls into `AuthApiClient.refreshTokens` and updates tokens.
  - Without an active session, returns `AUTH_NO_SESSION` (or similar).
- Restore (MVP):
  - Behavior for in-memory-only mode is clear and stable (e.g., returns `Ok<null>`).

Existing tests (`tests/core/authSessionManager.test.ts`) already exercise these behaviors using fake clients. As new behaviors (persistence, backend logout) are added, tests must be expanded accordingly.

## 9. Performance Considerations

- The module is primarily a state orchestrator; heavy work is delegated to `AuthApiClient` (HTTP calls).
- In-memory operations are O(1) and negligible compared to network latency.

No special performance budget is required solely for AuthSessionManager; any performance considerations should be tied to auth-related endpoints and UI flows.

## 10. CI / Governance Integration

Any change to:

- The shape of `AuthSession`.
- The semantics of login/logout/refresh/restoreSession.
- The relationship between AuthSessionManager and other core.auth modules.

MUST:

1. Update this spec.
2. Update `src/core/auth/AuthSessionManager.ts` accordingly.
3. Update tests in `tests/core/authSessionManager.test.ts`.
4. Keep the `core.auth` block spec and inventory notes in sync (e.g., when persistence is added and status moves toward Stable).
5. Ensure `npm run spec:check` passes from the monorepo root.

AI agents and humans MUST keep the MVP constraint (in-memory only) in mind and clearly document any changes that add persistence or more complex flows.
