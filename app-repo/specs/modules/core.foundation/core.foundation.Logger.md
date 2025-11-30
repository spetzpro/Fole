# Module: core.foundation.Logger

## Module ID
core.foundation.Logger

## 1. Purpose

The `core.foundation.Logger` module provides a **central, leveled logging API** for the entire application.

It is responsible for:

- Exposing a simple, scoped logger interface (`debug`, `info`, `warn`, `error`).
- Supporting leveled logging via a global log level.
- Ensuring logging calls are **non-throwing** and safe to use from any layer.
- Allowing the underlying logging sink (console/file/remote service) to evolve without changing call sites.

It is not responsible for:

- End-user notifications.
- Structured telemetry/metrics (which may be built on top later).
- UI error display.

## 2. Responsibilities and Non-Responsibilities

### Responsibilities

- Define the `LogLevel` and `Logger` interfaces:

  ```ts
  export type LogLevel = "debug" | "info" | "warn" | "error";

  export interface Logger {
    debug(message: string, meta?: unknown): void;
    info(message: string, meta?: unknown): void;
    warn(message: string, meta?: unknown): void;
    error(message: string, meta?: unknown): void;
  }
  ```

- Provide:

  ```ts
  export function getLogger(scope: string): Logger;
  export function setGlobalLogLevel(level: LogLevel): void;
  ```

- Implement a default logger that:

  - Prefixes messages with the given scope (e.g. `[core.storage.ProjectRegistry]`).
  - Uses a global log level to drop logs below the configured severity.
  - Logs via `console` in a way that never throws (using try/catch).

### Non-Responsibilities

- Does **not** decide where logs are ultimately written beyond the current sinks (console).
- Does **not** manage log rotation, persistence, or remote shipping.
- Does **not** integrate with DiagnosticsHub by default (this is a future enhancement).

## 3. Public API

> Conceptual API; implementation lives in `src/core/foundation/Logger.ts`.

```ts
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

export function getLogger(scope: string): Logger;
export function setGlobalLogLevel(level: LogLevel): void;
```

Behavior:

- `getLogger(scope)` returns a scoped logger that prefixes all messages with `[scope]`.
- `setGlobalLogLevel(level)` sets the minimum level that will be logged.
- Logs below the global level are dropped.

## 4. Internal Model and Invariants

### Invariants

- Logger calls must **never throw**:
  - All calls to `console` (or other sinks) are wrapped in try/catch.
- Global log level is respected consistently for all scopes.
- Scope prefixing is stable (e.g. `[scope] message`).

### Implementation notes

- A simple `levelOrder` map is used to determine which messages should be logged.
- `safeLog` helper encapsulates console calls and error swallowing.

## 5. Planned vs Implemented

### Current status

- **Lifecycle status**: Implemented
  - Implementation exists at `src/core/foundation/Logger.ts`.
  - Tests at `tests/core/logger.test.ts` verify:
    - Logger methods are callable at different levels without throwing.
    - Global log level filtering works as expected (at least via smoke checks).
  - Logging currently uses `console` as its only sink.

### Planned enhancements

- Configurable sinks:
  - Allow wiring in a remote logging service or file logger.
- Optional integration with `core.foundation.DiagnosticsHub` to emit structured events.
- More detailed tests for scoped prefixes and filtering behavior.

## 6. Dependencies

### Upstream dependencies

- Only runtime primitives (`console`) and basic JS/TS types.

It MUST NOT depend on:

- `core.auth`, `core.permissions`, `core.storage`, `core.ui`, or feature modules.
- DB, network, or UI modules.

### Downstream dependents

- All blocks (`core.*`, `feature.*`, `lib.*`) that need logging.

## 7. Testing Strategy

Tests SHOULD:

- Call `getLogger("scope")` and verify:
  - Methods do not throw.
  - Changing global log level does not cause errors.
- Optionally mock `console` to assert:
  - Scope prefixes appear as expected.
  - Calls below global level are dropped.

Existing tests focus on non-throwing behavior and global level; future tests may add more detailed assertions as needed.

## 8. CI / Governance Integration

Any change to:

- The Logger interface.
- Global log level semantics.
- Scope prefix formatting.

MUST:

1. Update this spec.
2. Update `Logger.ts`.
3. Update `logger.test.ts` and any other logger-related tests.
4. Keep the `core.foundation` block spec and inventory notes in sync.
5. Ensure `npm run spec:check` passes from the repo root.
