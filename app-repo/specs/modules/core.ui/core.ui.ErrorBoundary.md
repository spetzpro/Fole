# Module: core.ui.ErrorBoundary

## Module ID
core.ui.ErrorBoundary

## 1. Purpose

The `core.ui.ErrorBoundary` module provides a **React error boundary** that protects the application shell (and large UI subtrees) from uncaught render errors.

It is responsible for:

- Catching React render/runtime errors in its child tree.
- Forwarding those errors to the central `core.ui.ErrorSurface` for logging and diagnostics.
- Rendering a stable fallback UI instead of letting the entire app crash.

It must be **fail-safe**: error reporting itself must not throw or unmount the root unintentionally.

## 2. Responsibilities and Non-Responsibilities

### Responsibilities

- Implement a React error boundary component (class or functional with error boundary hooks).
- Catch errors thrown by descendants during render, commit, or lifecycle.
- Notify `core.ui.ErrorSurface` (via `getErrorSurface()` or equivalent) with error details.
- Render a fallback UI when errors occur:
  - A minimal, robust message (and maybe a “try again” affordance) as defined by the implementation.
- Limit error boundary scope to its children; it does not globally override all error handling in the app.

### Non-Responsibilities

- Does **not** decide how errors are logged or stored — that’s `ErrorSurface` and `core.foundation`’s job.
- Does **not** own feature-specific recovery logic (e.g., resetting specific panels).
- Does **not** manage routing or application state; it only decides how to render in the presence of errors.

## 3. Public API

> Conceptual API; actual signatures live in
> `src/core/ui/ErrorBoundary.tsx` and must remain compatible.

### Component

- Default export: `ErrorBoundary` React component.

Conceptually:

```tsx
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode; // optional override
}

declare function ErrorBoundary(props: ErrorBoundaryProps): JSX.Element;
```

Behavior:

- If no error has occurred:
  - Renders `props.children` as-is.
- If an error is caught:
  - Forwards the error + info to `ErrorSurface`.
  - Renders either:
    - `props.fallback` if provided, or
    - A default fallback UI defined by this module.

## 4. Internal Model and Invariants

### Invariants

- Error reporting must **never throw**:
  - Calls into `ErrorSurface` must be wrapped so that logging/diagnostics failures do not crash the boundary.
- The boundary must not enter a state where it repeatedly throws on every render:
  - Once in error state, rendering the fallback must be robust.
- The boundary must not corrupt global app state; it only affects rendering of its children.

### Integration with ErrorSurface

- Uses `getErrorSurface()` (or equivalent) from `core.ui.ErrorSurface` to:
  - Log/record error details.
  - Emit diagnostics into `core.foundation.DiagnosticsHub` (via ErrorSurface).
- Does not directly use `Logger` or `DiagnosticsHub` to keep responsibilities separated.

If the integration pattern changes (e.g., different hook or error reporting API), this spec must be updated accordingly.

## 5. Planned vs Implemented

### Current status

- **Lifecycle status**: `Implemented`
  - Implementation exists at `src/core/ui/ErrorBoundary.tsx`.
  - Tests exist at `tests/core/errorBoundary.test.tsx`.
  - Behavior is validated to:
    - Catch errors in children.
    - Render a fallback instead of crashing.
    - Interact with `ErrorSurface` without throwing.

### Planned enhancements

- More advanced fallback behaviors (e.g., offering a reload button or error details in development mode).
- Support for multiple boundary instances with different scopes and behaviors (if needed by UX).

All such changes must maintain the fail-safe requirements.

## 6. Dependencies

### Upstream dependencies

`core.ui.ErrorBoundary` depends on:

- React (for the component and error boundary behavior).
- `core.ui.ErrorSurface` (via a local import like `getErrorSurface`).

It MUST NOT depend directly on:

- Feature modules (`feature.*`).
- Low-level logging or diagnostics modules (`core.foundation`) — it delegates to `ErrorSurface` instead.
- Routing or storage modules.

### Downstream dependents

Expected consumers:

- The main app entry point or shell:
  - Wrapping top-level UI.
- Potentially, specific UI subtrees that warrant their own boundary.

## 7. Error Model

The component itself is part of the **error handling path**, so:

- It must not throw during:
  - Error capture (React error boundary hooks).
  - Logging via `ErrorSurface`.
  - Rendering its fallback UI.
- If `ErrorSurface` throws unexpectedly, the boundary must catch that and fall back to a minimal render-only strategy (e.g., logging to `console.error` and rendering a hard-coded fallback).

Tests should verify that the boundary remains stable under error conditions.

## 8. Testing Strategy

Tests MUST cover:

- Normal rendering:
  - When children do not throw, `ErrorBoundary` renders children unchanged.
- Error capture:
  - When a child throws, `ErrorBoundary`:
    - Calls into `ErrorSurface` (can be mocked).
    - Renders a fallback instead of crashing.
- Custom fallback:
  - When a `fallback` prop is provided, it is used instead of the default fallback.
- Robustness:
  - If `ErrorSurface` throws during error handling, the boundary still renders *something* and does not crash the test.

Existing tests (`tests/core/errorBoundary.test.tsx`) already cover basic behavior. As new behavior is added, tests MUST be updated to match the spec.

## 9. Performance Considerations

- Error boundaries add negligible overhead in normal operation.
- Error handling paths may perform logging and diagnostics; this is acceptable as an infrequent (exceptional) cost.
- No specific performance budget is required for this module alone; it is implicitly part of the overall UI shell budget.

## 10. CI / Governance Integration

Any change to:

- The public props or behavior of `ErrorBoundary`.
- How errors are forwarded to `ErrorSurface`.
- The fallback rendering semantics.

MUST:

1. Update this spec.
2. Update `src/core/ui/ErrorBoundary.tsx` to match.
3. Update tests in `tests/core/errorBoundary.test.tsx`.
4. Keep the `core.ui` block spec and inventory entry in sync.
5. Ensure `npm run spec:check` passes from the monorepo root.

AI agents and humans MUST follow `_AI_MASTER_RULES.md` and `Spec_Workflow_Guide.md` when evolving this module.
