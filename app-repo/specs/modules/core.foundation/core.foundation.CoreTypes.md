# Module: core.foundation.CoreTypes

## 1. Purpose

Define fundamental, reusable TypeScript types used across the entire codebase,
including Result, AppError, and optional/utility types.

CoreTypes is intended to be dependency-free (other than TypeScript itself) and
safe to import from any module in the system.

## 2. Responsibilities

- Provide a canonical Result type for success/failure without throwing.
- Provide an AppError shape with structured error codes.
- Provide simple utility types (Maybe, Nullable) as needed.

Not responsible for:

- UI-specific error structures.
- Network-specific error handling.
- Database-specific error types.

## 3. Types (MVP)

~~~ts
/**
 * Generic success/failure result type used throughout the app.
 */
export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * Core application error type.
 * Code is a stable, machine-readable string.
 */
export interface AppError {
  code: string;           // e.g. "PERMISSION_DENIED", "NOT_FOUND", "DB_ERROR"
  message: string;        // human-readable summary
  details?: unknown;      // optional arbitrary payload for debugging
  cause?: unknown;        // optional underlying error/exception
}

/**
 * Optional value helper.
 */
export type Maybe<T> = T | null | undefined;
~~~

## 4. Usage Notes

- Result should be preferred over throwing for:
  - service-level APIs
  - domain logic
  - permission checks
  - storage/IO boundaries (DB, filesystem)
- AppError codes should be:
  - short and stable
  - documented centrally (in an error catalog or shared reference)
- Throwing is still allowed in:
  - truly exceptional conditions
  - UI guard layers (which can catch and convert to AppError/Result)

## 5. Dependencies

- CoreTypes must not depend on any other internal modules.
- It is safe for:
  - core.*, feature.*, lib.*, and UI modules
  to import types from CoreTypes.
