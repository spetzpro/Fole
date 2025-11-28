# Module: core.ui.ErrorSurface

## Module ID
core.ui.ErrorSurface

## 1. Purpose

The `core.ui.ErrorSurface` module provides a **central error reporting surface** for the UI layer.

It is responsible for:

- Receiving error reports from `ErrorBoundary` and other core components.
- Logging errors via `core.foundation.Logger`.
- Emitting structured diagnostics via `core.foundation.DiagnosticsHub` (or equivalent).
- Ensuring that error reporting is **fail-safe** and never throws.

It does **not** render UI; it is a non-visual service object used by UI components.

## 2. Responsibilities and Non-Responsibilities

### Responsibilities

- Expose a function (e.g., `getErrorSurface()`) that returns a singleton-like error surface object.
- Provide methods on that surface to:
  - Report UI errors (error + optional context).
  - Emit diagnostics events to the diagnostics hub.
  - Optionally log user-friendly messages.
- Ensure internal error handling never throws, even if logging or diagnostics fail.

### Non-Responsibilities

- Does **not** render any React components (that’s `ErrorBoundary`’s job).
- Does **not** decide how the UI reacts visually to errors.
- Does **not** perform persistence; it only logs/emits diagnostics via core.foundation.
- Does **not** implement business logic specific to any feature module.

## 3. Public API

> Conceptual API; actual signatures live in
> `src/core/ui/ErrorSurface.ts` and must remain compatible.

### Types

- `interface AppErrorContext {`
  - `componentName?: string`
  - `boundaryName?: string`
  - `info?: unknown` // React error info or similar
  - `extra?: Record<string, unknown>`
  - `}`

- `interface ErrorSurface {`
  - `reportError(error: unknown, context?: AppErrorContext): void`
  - `}`

### Accessor

- `function getErrorSurface(): ErrorSurface`

Behavior:

- `getErrorSurface()` returns a shared instance used across the app.
- `reportError`:
  - Accepts any thrown value (`unknown`), wraps it as needed.
  - Logs a structured message via `Logger`.
  - Emits a diagnostic event (e.g., to `DiagnosticsHub`) including context.
  - Never throws.

## 4. Internal Model and Invariants

### Invariants

- All methods on `ErrorSurface` are **best-effort** and must not throw.
- Logging and diagnostics are **additive**:
  - Failures in logging or diagnostics must not propagate to callers.
- The surface is lightweight:
  - No heavy processing or network IO beyond what logging/diagnostics infrastructure already does.

### Integration with core.foundation

- Uses `getLogger()` (or equivalent) for logging.
- Uses `emitDiagnostic()` (or equivalent) for structured diagnostics.
- Does not manage logger/diagnostics configuration; it simply uses the core.foundation APIs.

If these integration points change, this spec must be updated.

## 5. Planned vs Implemented

### Current status

- **Lifecycle status**: `Implemented`
  - Implementation exists at `src/core/ui/ErrorSurface.ts`.
  - It imports from `core.foundation` (`AppError`, `getLogger`, `emitDiagnostic`) and exposes an error surface used by `ErrorBoundary`.
  - There may not yet be dedicated tests; if so, tests MUST be added over time to enforce behavior.

### Planned improvements

- Add explicit tests for ErrorSurface behavior (logging, diagnostics, non-throwing guarantees).
- Support environment-aware behavior (e.g., more verbose logging in development).

## 6. Dependencies

### Upstream dependencies

`core.ui.ErrorSurface` depends on:

- `core.foundation`:
  - `AppError` (or equivalent error wrapper).
  - `Logger` and logging utilities.
  - `DiagnosticsHub` or an equivalent diagnostics emitter.

It MUST NOT depend on:

- Feature modules (`feature.*`).
- Routing or storage modules.
- Backend/networking modules beyond what diagnostics/logging already rely on.

### Downstream dependents

Expected consumers:

- `core.ui.ErrorBoundary`.
- Any other core UI component that wants to report non-fatal errors centrally.

## 7. Error Model

The core contract:

- `reportError` **must not throw** under any circumstances.
- If logging or diagnostics fail:
  - The surface catches those errors internally.
  - At most, it may log to `console.error` as a last resort.
- Callers (like `ErrorBoundary`) can safely call into ErrorSurface even while the UI is in a broken state.

## 8. Testing Strategy

Tests SHOULD cover:

- Calling `reportError` with:
  - A normal `Error` instance.
  - Non-Error values (strings, objects).
  - Context containing component/boundary names.
- Ensuring that:
  - The logger is invoked with an appropriate message.
  - A diagnostic event is emitted with the right fields.
  - No exceptions are thrown, even if the logger/diagnostics mocks are made to throw.

If there are currently no tests, they should be added under `tests/core/errorSurface.test.ts` or a similar file.

## 9. Performance Considerations

`ErrorSurface` is used on error paths only:

- Normal operation should incur minimal overhead (only the presence of the singleton itself).
- When errors occur, logging/diagnostics may perform some work; this is acceptable as an exceptional path.

No dedicated performance budget is required for this module alone.

## 10. CI / Governance Integration

Any change to:

- The API of `ErrorSurface` or `getErrorSurface`.
- How logging/diagnostics are performed.
- The non-throwing guarantees of `reportError`.

MUST:

1. Update this spec.
2. Update `src/core/ui/ErrorSurface.ts` accordingly.
3. Add or update tests for ErrorSurface.
4. Keep the `core.ui` block spec and inventory entry in sync.
5. Ensure `npm run spec:check` passes from the monorepo root.

AI agents and humans MUST follow `_AI_MASTER_RULES.md` and `Spec_Workflow_Guide.md` when evolving this module.
