# AI Guidance: Error Handling & Diagnostics

File: `specs/core/_AI_ERROR_HANDLING_AND_DIAGNOSTICS_SPEC.md`  
Scope: How the AI should think about errors, logging, diagnostics, and their relationship to `core.foundation` and other blocks.

---

## 1. Goals

Error handling and diagnostics must:

- Provide **clear, consistent error information** to users and developers.
- Use a common **AppError** shape and `Result<T, AppError>` for recoverable failures.
- Ensure all layers have access to a **Logger** and a **DiagnosticsHub** for deeper visibility.
- Avoid crashing the app for non-fatal issues, while still surfacing problems.

This doc is conceptual. Concrete contracts are defined in:

- `specs/modules/core.foundation/core.foundation.CoreTypes.md`
- `specs/modules/core.foundation/core.foundation.Logger.md`
- `specs/modules/core.foundation/core.foundation.DiagnosticsHub.md`
- `specs/modules/core.ui/core.ui.ErrorBoundary.md`

### 1.5 Current Implementation Status (MVP)

- `AppError` and `Result<T, AppError>` are implemented in `core.foundation.CoreTypes` and used across core/auth/permissions/storage/UI.
- `Logger` and `DiagnosticsHub` are implemented with:
  - console-based logging
  - an in-process diagnostics hub with a no-op default implementation.
- UI error boundaries (`core.ui.ErrorBoundary` + `core.ui.ErrorSurface`) are implemented and tested.
- `lib.image` and `lib.geo` are Specced-only; the image/geo error advice in this document describes **future** behavior for those libraries.
- Centralized monitoring/alerting and vendor integrations are Specced in `_AI_MONITORING_AND_ALERTING_SPEC.md` but not implemented in this repository.

When generating or modifying code, assume this MVP state and use the AppError/Result/logger/diagnostics APIs accordingly.

---

## 2. AppError and Result

Central error types come from `core.foundation.CoreTypes`:

- `AppError`
- `Result<T, AppError>`

Principles:

- Prefer returning `Result<T, AppError>` from:
  - service functions
  - DAL operations
  - permission checks
  - other core logic.
- Reserve throwing for:
  - unexpected programming errors
  - framework-level issues
  - React boundaries (`ErrorBoundary`) that catch and report.

`AppError` structure:

- `code: string` – machine-readable identifier (e.g. `PERMISSION_DENIED`, `NOT_FOUND`, `DB_ERROR`).
- `message: string` – human-readable.
- `details?: unknown` – extra data for debugging.
- `cause?: unknown` – underlying error.

Codes should be:

- short
- stable
- centrally documented (this spec + future error catalog).

**MVP note:** Codes currently used in the codebase include examples like:

- `PERMISSION_DENIED`
- `AUTH_LOGIN_FAILED`
- `STORAGE_IO_ERROR`
- `DB_MIGRATION_FAILED`

A full catalog is planned but not yet maintained in a single place.

### 2.1 Result & AppError Conventions for Core and Feature Services

Core and feature services SHOULD expose recoverable failures via
`Result<T, AppError>` rather than throwing. This includes, but is not
limited to:

- permission checks and guarded operations
- validation errors
- not-found conditions for resources that may legitimately disappear.

Permission-denied outcomes MUST use a consistent `AppError` shape:

- `code: "PERMISSION_DENIED"`
- `message: "Permission denied"`
- `details: { reasonCode, grantSource }`

Where `reasonCode` and `grantSource` are copied from the underlying
`PermissionDecision` returned by `core.permissions`.

Thrown errors are reserved for unexpected/system/internal failures
(programming errors, invariant violations, framework issues) and for
boundary layers such as UI error boundaries that intentionally catch and
surface them. Normal permission denials and other expected error paths
MUST NOT rely on throwing.

---

## 3. Logger

`core.foundation.Logger` provides a scoped logging API:

- `getLogger(scope: string)` → `Logger`
- Levels: `debug`, `info`, `warn`, `error`

Guidelines:

- Each module/block should use a **descriptive scope**:
  - `"core.storage.ProjectRegistry"`
  - `"feature.map.FeatureMapService"`
  - `"core.permissions.PermissionService"`, etc.
- Logging must never throw.
- Log calls should be meaningful:
  - include relevant context in `meta`.
  - avoid spamming with unstructured noise.

In tests:

- Logs may be:
  - silenced, or
  - captured for assertions.

**MVP note:** The default implementation logs to `console` only. Future sinks (files, remote services) will be wired via lib.diagnostics and configuration.

---

## 4. DiagnosticsHub

`core.foundation.DiagnosticsHub` aggregates diagnostics events:

- non-fatal errors
- warnings
- performance signals (later)
- permission denials (optional, aggregated)

Use cases:

- capturing structured diagnostic events in one place
- feeding data to:
  - dev console
  - logs
  - future monitoring/alerting systems

Modules may:

- emit events to DiagnosticsHub when:
  - migrations fail
  - unexpected DB/state inconsistencies occur
  - repeated permission denials might indicate a misconfiguration.

**MVP note:** DiagnosticsHub is in-process only. It is up to the application bootstrap to install a hub that forwards events to any external monitoring system.

---

## 5. UI Error Boundaries

`core.ui.ErrorBoundary` wraps key UI surfaces:

- Catches thrown errors in React components.
- Renders:
  - a safe fallback UI
  - user-friendly messaging
- Logs details via Logger/DiagnosticsHub.

Guidelines:

- Error boundaries should not expose sensitive details to end-users.
- They should provide:
  - a way to retry
  - navigation back to a safe screen (e.g. Project List).
- Under the hood, they can:
  - log full stack traces
  - include route and state info in diagnostics (careful with PII).

---

## 6. Permission & Override Diagnostics

For permission checks (`core.permissions`):

- Permission failures should usually **not** be treated as errors:
  - they are expected outcomes in many workflows.
- However, repeated or unexpected permission denials may indicate:
  - misconfigured roles
  - bugs in policy logic
  - misuse of APIs

Guidelines:

- PermissionService returns a `PermissionDecision` with:
  - `allowed`
  - `reasonCode`
  - `grantSource` (for allowed decisions)
- Consumers may:
  - log unusual patterns (e.g. frequent `UNKNOWN` or `NOT_AUTHENTICATED` reasons).
  - pass selected events to DiagnosticsHub for analysis.

Override-specific behavior:

- When `grantSource = "override_permission"`, it’s not an error *per se*, but:
  - some actions (especially destructive ones) may warrant extra audit/diagnostic events later.

---

## 7. Storage & DB Error Handling

Storage and DB operations (FileStorage, DAL, migrations) should:

- return `Result<T, AppError>` when failures are expected/possible.
- use error codes such as:
  - `STORAGE_NOT_FOUND`
  - `STORAGE_IO_ERROR`
  - `DB_CONNECTION_FAILED`
  - `DB_MIGRATION_FAILED`

On serious failures:

- log via Logger with scope (e.g. `"core.storage.MigrationRunner"` or `"core.storage.ProjectRegistry"`).
- emit diagnostic events with:
  - projectId
  - operation
  - high-level outcome.

Certain failures may be considered **fatal for a given project** (e.g. migration failure), but the app as a whole should still run and show a clear error.

---

## 8. Image/Geo Pipeline Errors

Image pipeline and geo/calibration modules should:

- **validate inputs** (dimensions, file types, coordinate ranges).
- fail fast with clear errors when inputs are invalid.
- prefer not to store partially-processed data.

Examples:

- If a floorplan image is too large → `IMAGE_TOO_LARGE`.
- If calibration points are inconsistent → `CALIBRATION_INVALID`.

Such errors:

- should be surfaced to the user with helpful hints.
- should be logged with enough context for debugging (without leaking sensitive coordinates in logs if that’s a concern).

**MVP note:** `lib.image` and `lib.geo` are currently Specced-only; this section describes **target** behavior for those libraries once implemented.

---

## 9. Monitoring & Alerting (Future)

This spec is primarily about **local** error handling and diagnostics.

Future work (`_AI_MONITORING_AND_ALERTING_SPEC.md`) will describe:

- shipping logs and diagnostics to a central system
- setting up alerts for:
  - repeated DB migration failures
  - storage errors
  - high rates of unexpected AppError codes

---

## 10. How AI Agents Should Behave

When generating or modifying code:

- Prefer `Result<T, AppError>` for operations that can fail in normal ways.
- Use `AppError` codes that are:
  - meaningful
  - re-usable
  - consistent with other modules.
- Ensure all unexpected branches:
  - either throw (to be caught at a boundary) or
  - return a failure Result with an appropriate code.
- Add logging and/or diagnostics at:
  - error paths
  - important state transitions
   
---

## 11. Tooling & Test Harness Notes (MVP)

- TODO (tooling arc): fix test tooling for feature tests so that
  `app-repo/tests/feature/**` (including
  `app-repo/tests/feature/files/filesPermissions.test.ts`) run under the
  same `ts-node`/TypeScript configuration as core tests. This will
  likely involve wiring feature tests into the root test scripts and/or
  introducing minimal tsconfig/test script adjustments in a dedicated
  tooling arc.

  - rare but significant events.

This spec should be consulted together with the relevant module specs for `core.foundation` and the `_AI_*` docs for specific domains (storage, image pipeline, geo, etc.).
