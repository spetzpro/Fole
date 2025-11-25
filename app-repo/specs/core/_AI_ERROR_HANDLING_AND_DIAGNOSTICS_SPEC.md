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

---

## 3. Logger

`core.foundation.Logger` provides a scoped logging API:

- `getLogger(scope: string)` → `Logger`
- Levels: `debug`, `info`, `warn`, `error`

Guidelines:

- Each module/block should use a **descriptive scope**:
  - `"core.storage.ProjectRegistry"`
  - `"feature.map.MapViewport"`
  - `"core.permissions.PermissionService"`, etc.
- Logging must never throw.
- Log calls should be meaningful:
  - include relevant context in `meta`.
  - avoid spamming with unstructured noise.

In tests:

- Logs may be:
  - silenced, or
  - captured for assertions.

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

- log via Logger with scope (e.g. `"core.storage.MigrationRunner"`).
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
  - rare but significant events.

This spec should be consulted together with the relevant module specs for `core.foundation` and the `_AI_*` docs for specific domains (storage, image pipeline, geo, etc.).
