# Module: core.foundation.Logger

## 1. Purpose

Provide a simple, centralized logging API for the entire application.

Logger wraps whatever logging implementation is used under the hood
(console.log, file logging, remote logging, etc.) so the rest of the codebase
does not depend on specific logging libraries or side effects.

## 2. Responsibilities

- Provide leveled logging: debug, info, warn, error.
- Allow namespacing / scoping (e.g. `core.storage.ProjectRegistry`).
- Be safe to call from any layer (core, feature, UI, background jobs).
- Be no-op or minimal in tests unless explicitly configured.

Not responsible for:

- Structured telemetry/metrics (can be a separate module later).
- End-user notifications.
- UI error display.

## 3. Types (MVP)

~~~ts
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}
~~~

## 4. Public API (MVP)

~~~ts
/**
 * Get a logger instance for a given scope.
 * Example scopes:
 * - "core.storage.ProjectRegistry"
 * - "feature.map.MapViewport"
 */
export function getLogger(scope: string): Logger;

/**
 * Optional: set a global log level at runtime.
 * Logs below this level may be dropped.
 */
export function setGlobalLogLevel(level: LogLevel): void;
~~~

## 5. Behavior (MVP)

- `getLogger(scope)` returns a lightweight wrapper that tags all log messages with the given scope.
- Under the hood, logging can use:
  - `console` in development
  - more advanced sinks in production (files, remote services, etc.).
- Logging must **never throw**; failures in the logging pipeline should be swallowed
  or reported via diagnostics, not crash the app.
- In tests, logger can be configured to:
  - be silent by default, or
  - collect logs for assertion.

## 6. Dependencies

- May optionally integrate with:
  - core.foundation.DiagnosticsHub (to emit structured diagnostic events).
- Must not depend on:
  - feature.* blocks
  - UI modules
