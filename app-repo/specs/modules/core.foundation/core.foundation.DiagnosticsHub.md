# Module: core.foundation.DiagnosticsHub

## Module ID
core.foundation.DiagnosticsHub

## 1. Purpose

The `core.foundation.DiagnosticsHub` module provides a **non-fatal diagnostic event hub** for internal debugging and observability.

It is responsible for:

- Defining a standard `DiagnosticEvent` shape.
- Providing an interface for emitting and subscribing to diagnostic events.
- Ensuring diagnostic emission never throws, even if listeners or sinks fail.

It is not responsible for:

- Persisting diagnostic events.
- Directly integrating with external monitoring vendors (these can be layered onto the hub).
- User-facing error handling.

## 2. Responsibilities and Non-Responsibilities

### Responsibilities

- Define:

  ```ts
  export interface DiagnosticEvent {
    category: string;
    type: string;
    timestamp: string;
    level?: "debug" | "info" | "warn" | "error";
    correlationId?: string;
    data?: Record<string, unknown>;
  }
  ```

- Provide:

  ```ts
  export function initDiagnosticsHub(hub: {
    emit(event: DiagnosticEvent): void;
    subscribe(listener: (e: DiagnosticEvent) => void): () => void;
  }): void;

  export function getDiagnosticsHub(): {
    emit(event: DiagnosticEvent): void;
    subscribe(listener: (e: DiagnosticEvent) => void): () => void;
  };

  export function emitDiagnostic(event: DiagnosticEvent): void;
  ```

- Guarantee:

  - `emitDiagnostic` is safe to call and never throws.
  - Default hub is a no-op if not initialized.

### Non-Responsibilities

- Does **not** dictate how subscribers store or forward events.
- Does **not** enforce sampling or filtering policies.
- Does **not** expose user-visible errors.

## 3. Public API and Behavior

> Implementation lives in `src/core/foundation/DiagnosticsHub.ts`.

- `initDiagnosticsHub(hub)`:
  - Installs a concrete hub implementation as the current global hub.
- `getDiagnosticsHub()`:
  - Returns the current hub or a default no-op hub if none was installed.
- `emitDiagnostic(event)`:
  - Normalizes missing timestamp (fills in current time if needed).
  - Calls `getDiagnosticsHub().emit(event)` inside a try/catch.
  - Swallows any errors from the hub to avoid crashing callers.

The installed hub is responsible for:

- Implementing `emit` in a non-throwing way.
- Implementing `subscribe` and isolating listener failures.

## 4. Planned vs Implemented

### Current status

- **Lifecycle status**: Stable
  - Implementation exists at `src/core/foundation/DiagnosticsHub.ts`.
  - Tests at `tests/core/diagnosticsHub.test.ts` verify:
    - Default hub is no-op and non-throwing.
    - Installed hubs receive events via `emitDiagnostic`.
    - Subscriber failures do not propagate out of emitDiagnostic.

### Planned enhancements

- More advanced filtering (by category/level).
- Optionally wiring into external observability stacks.

## 5. Dependencies

### Upstream dependencies

- Basic JS/TS only.

### Downstream dependents

- Any module that wants to emit diagnostic events (`core.storage`, `core.permissions`, etc.).
- Logger may, in future, emit diagnostics as well.

## 6. Testing Strategy

Tests SHOULD:

- Use a fake hub with counters or arrays to assert that events are received.
- Simulate failing listeners and ensure errors are swallowed.
- Verify that events without timestamps receive one in `emitDiagnostic`.

Existing tests already cover these behaviors.

## 7. CI / Governance Integration

Any change to:

- The `DiagnosticEvent` shape.
- The behavior of `emitDiagnostic` or default hub.

MUST:

1. Update this spec.
2. Update `DiagnosticsHub.ts`.
3. Update `diagnosticsHub.test.ts`.
4. Keep block spec and inventory notes accurate.
5. Ensure `npm run spec:check` passes.
