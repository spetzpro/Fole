# Module: core.auth.AuthApiClient

## Module ID
core.auth.AuthApiClient

## 1. Purpose

The `core.auth.AuthApiClient` module defines the **interface between the application and backend authentication endpoints**.

It is responsible for:

- Defining the types used at the auth API boundary (tokens and user info).
- Providing a small, testable interface for:
  - Logging in with credentials.
  - Refreshing tokens.
  - Fetching the current user from the backend.
- Allowing the rest of `core.auth` to depend on a stable contract, while the actual HTTP transport and endpoint details are injected.

The module in this repo provides the **interface and wiring hooks**; concrete HTTP clients live outside this codebase (or are injected in tests).

## 2. Responsibilities and Non-Responsibilities

### Responsibilities

- Define the core auth boundary types:
  - `AuthTokens` — access + refresh tokens and expiry.
  - `AuthUserInfo` — user identity as the backend sees it.
  - `LoginRequest` — credentials payload.
- Define a TypeScript interface (or equivalent) for:
  - `login(LoginRequest): Promise<Result<{ tokens: AuthTokens; user: AuthUserInfo }>>`
  - `refreshTokens(refreshToken: string): Promise<Result<AuthTokens>>`
  - `fetchCurrentUser(accessToken: string): Promise<Result<AuthUserInfo>>`
- Provide a `getAuthApiClient`/setter pattern so that tests and production can install concrete implementations.

### Non-Responsibilities

- Does **not** implement HTTP logic itself in this repo:
  - Actual network calls, URLs, headers, and error decoding are the responsibility of injected implementations.
- Does **not** manage auth sessions (tokens in memory/persistence) — that is `AuthSessionManager`.
- Does **not** expose UI-facing auth state — that is `AuthStateStore` / `CurrentUserProvider`.

## 3. Public API

> This describes the conceptual API. The exact signatures live in
> `src/core/auth/AuthApiClient.ts` and must remain compatible with this spec.

### Types

- `interface AuthTokens {`
  - `accessToken: string`
  - `refreshToken: string`
  - `expiresAt: string` // ISO timestamp
  - `}`

- `interface AuthUserInfo {`
  - `id: string`
  - `displayName: string`
  - `email?: string`
  - `roles: string[]`
  - `}`

- `interface LoginRequest {`
  - `username: string`
  - `password: string`
  - `}`

### Interface

Conceptually:

```ts
interface AuthApiClient {
  login(req: LoginRequest): Promise<Result<{ tokens: AuthTokens; user: AuthUserInfo }>>;
  refreshTokens(refreshToken: string): Promise<Result<AuthTokens>>;
  fetchCurrentUser(accessToken: string): Promise<Result<AuthUserInfo>>;
}

declare function getAuthApiClient(): AuthApiClient;
declare function setAuthApiClient(impl: AuthApiClient): void;
```

Behavior:

- `getAuthApiClient()` returns the currently installed implementation.
- `setAuthApiClient()` is used in tests or application bootstrap to inject a concrete client.

The module itself does not prescribe how the client does HTTP; it only defines the contract.

## 4. Internal Model and Invariants

### Invariants

- A valid `AuthApiClient` implementation MUST:
  - Respect the `Result` contract, returning `Err` on network or auth failures rather than throwing for expected errors (invalid credentials, expired tokens, etc.).
  - Ensure that `AuthUserInfo` and `AuthTokens` values are consistent with how `AuthSessionManager` and `CurrentUserProvider` expect to use them.
- The installed client (via `setAuthApiClient`) should be treated as a singleton for the app runtime.

### Type coherence

- `AuthUserInfo` should map cleanly into the `CurrentUser` type used by `CurrentUserProvider` / `AuthStateStore`.
- Any evolution of user identity (e.g., new claims) MUST update both this spec and the associated core.auth module specs.

## 5. Planned vs Implemented

### Current status

- **Lifecycle status**: `Implemented` (interface-level)
  - Interface and types are implemented at `src/core/auth/AuthApiClient.ts`.
  - Tests for `AuthSessionManager` use a fake `AuthApiClient` to exercise the contract.
  - A canonical HTTP implementation is not included in this repo; this is by design and handled via dependency injection.

### Planned


- A production implementation, once added to this repo or a sibling package, MUST:
  - Follow this contract exactly.
  - Provide clear error mapping from HTTP responses to `Result` values.

Any such implementation MUST be documented separately and referenced from this module’s usage notes.

## 6. Dependencies

### Upstream dependencies

Within this repo, `AuthApiClient` has no strong code dependencies except for:

- Shared types (e.g., `Result`) from `core.foundation` or equivalent.

It MUST NOT depend on:

- UI modules.
- Storage or DB modules.

### Downstream dependents

Expected consumers:

- `core.auth.AuthSessionManager`
- Tests that exercise auth flows with fake or test clients.

## 7. Error Model

- All methods return `Result<...>`:
  - On success: `Ok<T>`.
  - On failure: `Err` with a stable error code and message (e.g., `AUTH_LOGIN_FAILED`, `AUTH_REFRESH_FAILED`, `AUTH_ME_FAILED`).

The exact error codes used by concrete implementations should be documented alongside those implementations; this spec requires that **expected errors** (invalid credentials, expired tokens) use `Result` rather than thrown exceptions.

## 8. Testing Strategy

Since this repo provides the interface only, tests focus on:

- Ensuring that callers (e.g., `AuthSessionManager`) correctly handle both `Ok` and `Err` results from an `AuthApiClient` implementation.
- Fake implementations used in tests should simulate:
  - Successful login.
  - Failed login (invalid credentials).
  - Successful token refresh.
  - Failed refresh (expired/invalid refresh token).

No direct tests of a concrete HTTP implementation exist here; they belong in whichever package provides that implementation.

## 9. Performance Considerations

`AuthApiClient` itself is an abstraction; performance characteristics are dictated by the underlying HTTP client.

- The interface has no heavy computation; only async HTTP work.
- As long as concrete implementations are reasonably efficient, there are no special performance concerns at this layer.

## 10. CI / Governance Integration

Any change to:

- `AuthTokens`, `AuthUserInfo`, or `LoginRequest` shapes.
- Method signatures on `AuthApiClient`.
- The semantics of `getAuthApiClient`/`setAuthApiClient`.

MUST:

1. Update this spec.
2. Update `src/core/auth/AuthApiClient.ts` accordingly.
3. Update consumers, particularly `AuthSessionManager` and its tests.
4. Keep the `core.auth` block spec and inventory notes in sync.
5. Ensure `npm run spec:check` passes from the monorepo root.

AI agents and humans MUST treat this module as the **auth boundary interface** and keep it coherent with `CurrentUser` and other core.auth types.
