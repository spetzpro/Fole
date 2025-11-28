# Block: core.auth

## Block ID
core.auth

## 1. Purpose

The `core.auth` block owns **identity and authentication** for the application.

It is responsible for:

- Managing login and logout flows.
- Managing authentication sessions (tokens + associated user info).
- Exposing the current authenticated user and high-level auth state to the rest of the system.
- Providing a small, testable surface for the UI and `core.permissions` to query authentication state.

It is **not** responsible for:

- Fine-grained permissions or authorization rules (delegated to `core.permissions`).
- UI layout or navigation (delegated to `core.ui`).
- User profile editing beyond basic identity information (future feature blocks).

## 2. Scope and Non-Scope

### In scope

- Representing authenticated user identity (`CurrentUser`).
- Representing and managing auth sessions (tokens, expiry, user info).
- Providing a reactive auth state store for UI.
- Defining an API client interface for backend auth endpoints.
- Orchestrating login/logout/refresh/restore flows at the module level.

### Out of scope

- Role/permission evaluation (who can do what) — this is `core.permissions`.
- Persisting arbitrary user settings or profiles — these will live in separate feature blocks.
- Low-level HTTP transport details (e.g., fetch/axios) — these are injected behind the `AuthApiClient` interface.

## 3. Block Decomposition

The block is decomposed into these modules:

| Module ID                           | Responsibility                                                | Status      |
|------------------------------------|---------------------------------------------------------------|-------------|
| `core.auth.AuthApiClient`          | Interface to backend auth endpoints (login/refresh/me)       | Implemented |
| `core.auth.AuthSessionManager`     | Login/logout/refresh + in-memory session management          | Implemented |
| `core.auth.AuthStateStore`         | Reactive auth state store (status/user/error)                | Stable      |
| `core.auth.CurrentUserProvider`    | Read-only current user view + isAuthenticated() helpers      | Stable      |

Block-level lifecycle:

- **Block status**: `Implemented`
  - All four modules exist and are used in tests.
  - AuthSessionManager is currently an **MVP implementation** with in-memory-only sessions; durable persistence and richer flows are planned.

Any new modules added under `core.auth` MUST be added to this table and to the inventories.

## 4. Responsibilities per Module (High-Level)

### `core.auth.AuthApiClient` (Implemented)

Planned responsibilities (as of the MVP interface):

- Define the types used at the API boundary:
  - `AuthTokens` (accessToken, refreshToken, expiresAt).
  - `AuthUserInfo` (id, displayName, email?, roles: string[]).
  - `LoginRequest` (username, password).
- Provide an **interface** for:
  - `login(LoginRequest): Promise<Result<{ tokens: AuthTokens; user: AuthUserInfo }>>`
  - `refreshTokens(refreshToken: string): Promise<Result<AuthTokens>>`
  - `fetchCurrentUser(accessToken: string): Promise<Result<AuthUserInfo>>`
- Provide a singleton accessor (`getAuthApiClient`) and a way to inject a concrete implementation for tests and production.

The interface and types are implemented and used via dependency injection; the block does **not** prescribe the actual HTTP client or endpoint paths.

### `core.auth.AuthSessionManager` (Implemented, MVP)

Responsibilities:

- Orchestrate login/logout using `AuthApiClient`:
  - On `login`, call `AuthApiClient.login`, store tokens + user in memory, and return an `AuthSession`.
  - On `logout`, clear in-memory session data.
- Provide synchronous access to the current session:
  - `getCurrentSession(): AuthSession | null`.
- Provide a refresh flow:
  - `refreshSession()` uses the current refresh token (if any) to ask `AuthApiClient.refreshTokens` for new tokens.
- Provide a `restoreSession()` hook:
  - **MVP**: currently in-memory only; does not restore from disk or external storage.

The module is implemented and tested as an **in-memory session manager**, not yet a fully persistent “remember me” solution.

### `core.auth.AuthStateStore` (Stable)

Responsibilities:

- Hold high-level auth state for the UI, as a simple observable store:
  - `AuthStatus` = `"unauthenticated" | "authenticating" | "authenticated" | "error"`.
  - `AuthState` = { status, user: CurrentUser | null, lastError?: string }.
- Provide:
  - `getState()`, `subscribe(listener)`, `setState(next)` and `getAuthStateStore()`.

This module is the **UI-facing** representation of auth state. It is pure in-memory logic and has dedicated tests; its API and behavior are simple and stable.

### `core.auth.CurrentUserProvider` (Stable)

Responsibilities:

- Expose a read-only view of the current user identity:
  - `CurrentUser` with `id`, `displayName`, optional `email`, and `roles: string[]`.
- Provide helpers:
  - `getCurrentUser(): CurrentUser | null`
  - `isAuthenticated(): boolean`
- Internally, this is a small wrapper around `AuthSessionManager` (using session.user) and/or `AuthStateStore`, depending on implementation.

This module is a convenience facade for code that needs to query “who is the current user?” and “are we authenticated?” without dealing with tokens or raw sessions.

## 5. Invariants and Behavioral Guarantees

- **Type coherence**
  - `AuthUserInfo` and `CurrentUser` MUST remain consistent types at the core.auth boundary:
    - Both represent a single app-level identity with id, displayName, email?, and roles[].
  - Any evolution (e.g., adding tenantId or additional claims) MUST be reflected consistently across:
    - AuthApiClient.
    - AuthSessionManager.
    - AuthStateStore.
    - CurrentUserProvider.

- **Session invariants (MVP)**
  - `AuthSessionManager` maintains at most one in-memory session at a time.
  - A successful `login` replaces any existing in-memory session.
  - `logout` clears in-memory session state.
  - `getCurrentSession()` reflects this in-memory-only state.

- **AuthState invariants**
  - `AuthStateStore` is the single source of truth for high-level auth status + user + error.
  - Changes to session or login flows should be reflected in `AuthStateStore` via explicit updates from AuthSessionManager or associated orchestration.

- **Non-throwing contracts**
  - Public methods on the auth modules (API client, session manager, state store, current user provider) should return `Result` or safe values where possible, and avoid throwing for expected failures (e.g., invalid credentials).

## 6. Dependencies

### Allowed dependencies for `core.auth`

`core.auth` may depend on:

- `core.foundation` for:
  - Result/utility types.
  - Logging and diagnostics (where needed).
- (Optionally) lower-level HTTP or networking utilities (if abstracted under AuthApiClient).

It MUST NOT depend on:

- `feature.*` modules.
- `core.ui` (to avoid UI → auth circular dependencies).
- `core.storage` directly for persistence in the MVP; if persistence is added later, it should go through a well-defined abstraction and be documented.

### Downstream dependents

Expected consumers include:

- `core.ui` and UI components:
  - Use `AuthStateStore` and `CurrentUserProvider` to drive login views and guards.
- `core.permissions`:
  - Uses `CurrentUser` roles/claims as inputs into permission evaluation.
- Any service that needs to know “who is the current user?” or “are we authenticated?”.

## 7. Performance Considerations

At the MVP level:

- `AuthApiClient` is interface-only in this repo; performance of actual HTTP calls depends on the concrete implementation.
- `AuthSessionManager`, `AuthStateStore`, and `CurrentUserProvider` are lightweight, in-memory modules:
  - Their operations are O(1) or proportional to the number of subscribers (for the state store).

If/when persistent session storage or more complex flows are added, performance implications must be reflected in this block spec and, if necessary, in `specs/perf/performance_budget.json`.

## 8. Testing Strategy

The `core.auth` block relies on:

- Unit tests for:
  - `AuthSessionManager` (login/logout/refresh/restore with a fake `AuthApiClient`).
  - `AuthStateStore` (state transitions and subscription behavior).
  - `CurrentUserProvider` (isAuthenticated/getCurrentUser via a fake session manager).
- Integration tests (future):
  - End-to-end login/refresh/logout flows when a real HTTP implementation and persistence are wired in.

Any new behavior (e.g. persistent session restore, complex refresh policies) MUST be accompanied by tests covering both success and failure scenarios.

## 9. CI and Governance Integration

`core.auth` participates in the spec-first governance system:

- Any change that affects:
  - Auth flows (login/logout/refresh/restore).
  - The shape of `CurrentUser`, `AuthTokens`, or `AuthSession`.
  - The observable auth state model (`AuthState`).
  - Block-level dependencies (e.g., introducing persistence via storage).

MUST:

1. Update this block spec first.
2. Update the relevant module spec(s) under `specs/modules/core.auth/`.
3. Update implementations under `src/core/auth/**`.
4. Update or add tests under `tests/core/**`.
5. Keep `Blocks_Modules_Inventory.md` and `specs/inventory/inventory.json` in sync with the real lifecycle status and notes for `core.auth`.
6. Ensure `npm run spec:check` passes from the monorepo root (`E:\Fole`).

AI agents and humans MUST follow `_AI_MASTER_RULES.md` and `Spec_Workflow_Guide.md` when evolving `core.auth`, keeping **specs, inventory, code, and tests** aligned.
