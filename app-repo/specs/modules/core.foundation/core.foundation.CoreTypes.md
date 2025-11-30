# Module: core.foundation.CoreTypes

## Module ID
core.foundation.CoreTypes

## 1. Purpose

The `core.foundation.CoreTypes` module defines **fundamental types** used across the entire codebase:

- `Result<T, E>`
- `AppError`
- `Maybe<T>` (and related helpers)

It is responsible for:

- Providing a canonical `Result` type for success/failure without throwing.
- Providing a consistent `AppError` shape with structured error codes and optional details.
- Providing simple optional/utility types.

It is not responsible for:

- UI-specific error shapes.
- Network-specific error types.
- DB-specific error types.

## 2. Responsibilities and Non-Responsibilities

### Responsibilities

- Define:

  ```ts
  export type Result<T, E = AppError> =
    | { ok: true; value: T }
    | { ok: false; error: E };

  export interface AppError {
    code: string;
    message: string;
    details?: unknown;
    cause?: unknown;
  }

  export type Maybe<T> = T | null | undefined;
  ```

- Act as the **canonical** error/result model for:
  - core blocks (auth, permissions, storage, ui).
  - feature blocks (map, files, comments, sketch).
  - lib modules.

### Non-Responsibilities

- Does **not** prescribe specific error codes.
- Does **not** manage error logging; that is Logger/DiagnosticsHub.
- Does **not** define complex domain-specific error types.

## 3. Public Types and Usage

> Implementation lives in `src/core/foundation/CoreTypes.ts`.

- `Result<T, E>`:
  - Use `ok: true, value` for success.
  - Use `ok: false, error` for failure.
- `AppError`:
  - `code` is a stable identifier such as `"PERMISSION_DENIED"`, `"NOT_FOUND"`, `"DB_ERROR"`.
  - `message` is a human-readable summary.
  - `details` may hold structured data (e.g., `{ reasonCode, grantSource }`).
  - `cause` may hold an underlying error or context.

- `Maybe<T>`:
  - For optional values where both `null` and `undefined` are possible.

## 4. Planned vs Implemented

### Current status

- **Lifecycle status**: Implemented
  - CoreTypes is implemented at `src/core/foundation/CoreTypes.ts`.
  - Widely used by:
    - `core.auth` (Result<AuthSession>, AppError from login flows).
    - `core.permissions` (Result<void, AppError> in PermissionGuards).
    - `core.storage` (Result wrappers for IO/DB).
    - `core.ui` (ErrorSurface and ErrorBoundary).
  - There are no dedicated unit tests for CoreTypes; behavior is validated indirectly via consuming modules.

### Planned enhancements

- Add small unit tests that:
  - Demonstrate typical usage patterns.
  - Check error codes/messages for sample flows.
- Introduce a central error-code catalog (separate spec or doc) referenced by module specs:
  - E.g. define codes like `"PERMISSION_DENIED"`, `"AUTH_LOGIN_FAILED"`.

## 5. Dependencies

### Upstream dependencies

- No dependencies on internal modules.
- Only TS/JS built-ins.

### Downstream dependents

- All blocks and features that use Result/AppError.

## 6. Testing Strategy

Tests SHOULD:

- Construct simple `Result` and `AppError` values in a dedicated test file.
- Show typical patterns:
  - Handling `ok` vs `error`.
  - Inspecting `AppError.code` and `details`.

Until such tests exist, stability is inferred from consistent usage rather than direct tests.

## 7. CI / Governance Integration

Any change to:

- The structure of `Result` or `AppError`.
- The semantics of `Maybe<T>`.

MUST:

1. Update this spec.
2. Update `CoreTypes.ts`.
3. Review all specs that reference Result/AppError.
4. Ensure `npm run spec:check` passes.

AppError codes must be managed consistently across the system, ideally via a shared catalog referenced by higher-level specs.
