# Module: core.auth.AuthStateStore

## Module ID
core.auth.AuthStateStore

## 1. Purpose

The `core.auth.AuthStateStore` module owns the **high-level, reactive authentication state** used by the UI and other blocks to reason about whether the user is logged in.

It is responsible for:

- Providing an observable `AuthState` object with:
  - `status`: `"unauthenticated" | "authenticating" | "authenticated" | "error"`.
  - `user`: the current `CurrentUser` or `null`.
  - `lastError`: optional last error message or code.
- Allowing subscribers to react to auth state changes.
- Serving as the central, in-memory representation of auth status for UI logic.

It does not perform network calls or manage tokens directly; those responsibilities live in `AuthSessionManager` and `AuthApiClient`.

## 2. Responsibilities and Non-Responsibilities

### Responsibilities

- Define the `AuthStatus` and `AuthState` types.
- Maintain an in-memory `AuthState` with a well-defined initial value.
- Provide a singleton-style store (`getAuthStateStore`) exposing:
  - `getState(): AuthState`
  - `subscribe(listener: (state: AuthState) => void): () => void`
  - `setState(next: AuthState): void`
- Notify all listeners whenever `setState` is called.

### Non-Responsibilities

- Does **not** decide when to transition between states (e.g., from unauthenticated → authenticating → authenticated):
  - That is orchestrated by higher-level flows and/or `AuthSessionManager`.
- Does **not** manage tokens or sessions.
- Does **not** interact with storage, DB, or the network.

## 3. Public API

> Conceptual API; actual signatures live in
> `src/core/auth/AuthStateStore.ts` and must remain compatible.

### Types

- `type AuthStatus = "unauthenticated" | "authenticating" | "authenticated" | "error"`

- `interface AuthState {`
  - `status: AuthStatus`
  - `user: CurrentUser | null`
  - `lastError?: string`
  - `}`

### Store interface

Conceptually:

```ts
interface AuthStateStore {
  getState(): AuthState;
  subscribe(listener: (state: AuthState) => void): () => void;
  setState(next: AuthState): void;
}

declare function getAuthStateStore(): AuthStateStore;
```

### Behavior

- Initial state:
  - `status = "unauthenticated"`
  - `user = null`
  - `lastError` is `undefined`
- `subscribe(listener)`:
  - Immediately invokes the listener with the current state.
  - Returns an `unsubscribe` function.
- `setState(next)`:
  - Replaces the current state with `next`.
  - Notifies all subscribed listeners.

## 4. Internal Model and Invariants

### Invariants

- There is exactly one logical `AuthStateStore` per process (singleton).
- `AuthState.status` is always one of the `AuthStatus` union values.
- `AuthState.user` is always either a valid `CurrentUser` or `null`.
- `lastError`, if present, is a string intended for diagnostics/logging or short UI messages.

### Evolvability

- New fields may be added to `AuthState` as necessary (e.g., `lastSuccessAt`, `sessionId`).
- New `AuthStatus` variants may be added if new states are introduced.
- Any such changes MUST be reflected in this spec and in tests.

## 5. Planned vs Implemented

### Current status

- **Lifecycle status**: `Stable`
  - Implementation exists at `src/core/auth/AuthStateStore.ts`.
  - Tests exist at `tests/core/authStateStore.test.ts`, covering subscription behavior and state updates.
  - The API surface and semantics are straightforward and unlikely to change frequently.

### Planned enhancements

- Convenience helpers for common transitions (e.g., `setAuthenticating()`, `setError(message)`).
- Optional integration with logging/diagnostics on state transitions (e.g., logging when auth enters `error` state).

## 6. Dependencies

### Upstream dependencies

The module only depends on shared types (`CurrentUser`) from `CurrentUserTypes` or equivalent.

It MUST NOT depend on:

- `AuthSessionManager` (to avoid circular dependencies).
- UI components or routing modules.

### Downstream dependents

Expected consumers:

- UI components and hooks that need reactive auth state.
- Orchestration code that translates session events into `AuthState` updates.
- Potentially, `core.permissions` or other blocks that might use auth status as part of high-level behavior.

## 7. Error Model

The store itself does not fail under normal conditions:

- `getState` and `setState` are synchronous and do not return `Result`.
- Subscribers are expected to be well-behaved; if a listener throws, the store should still maintain its internal state.

If logging/diagnostics around `setState` are added in the future, any failures there must be contained and not break the store’s internal invariants.

## 8. Testing Strategy

Tests MUST cover:

- Initial subscription receiving the initial state.
- `setState` updating the state and notifying listeners.
- Multiple listeners receiving updates in order.
- `unsubscribe` stopping notifications for a listener.

Existing tests (`tests/core/authStateStore.test.ts`) verify basic subscription and state-change behavior. As new fields or transitions are added, tests must be extended accordingly.

## 9. Performance Considerations

- `setState` is O(N) in the number of listeners; this is acceptable for expected UI usage.
- There is no IO or heavy computation.

The module is essentially free from a performance perspective; no dedicated budget is required.

## 10. CI / Governance Integration

Any change to:

- The `AuthStatus` union.
- The `AuthState` shape.
- Subscription semantics (e.g., immediate vs delayed notifications).

MUST:

1. Update this spec.
2. Update `src/core/auth/AuthStateStore.ts` accordingly.
3. Update tests in `tests/core/authStateStore.test.ts`.
4. Keep the `core.auth` block spec and inventory synchronized.
5. Ensure `npm run spec:check` passes from the monorepo root.

AI agents and humans MUST treat this module as a **stable, simple building block** and preserve its invariants when making changes.
