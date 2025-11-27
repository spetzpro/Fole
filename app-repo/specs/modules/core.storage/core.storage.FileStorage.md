# Module: core.storage.FileStorage

## Module ID
core.storage.FileStorage

## 1. Purpose

The `core.storage.FileStorage` module provides a **thin, asynchronous file I/O abstraction** over the local filesystem.

It is responsible for:

- Reading and writing files as raw bytes or UTF-8 text.
- Deleting files in an **idempotent** way (deleting a non-existent file is treated as success).
- Returning `Result`-wrapped outcomes instead of throwing, with stable error codes.

It is **not** responsible for implementing the full atomic write pipeline; atomic semantics are owned by the dedicated AtomicWrite stack (`AtomicWriteService`, `AtomicWriteExecutor`, etc.), as described in the `core.storage` block spec.

## 2. Responsibilities and Non-Responsibilities

### Responsibilities

- Provide simple, predictable async wrappers for:
  - `readFile(path): Promise<Result<Buffer>>`
  - `readText(path): Promise<Result<string>>`
  - `writeFile(path, data: Buffer): Promise<Result<void>>`
  - `writeText(path, text: string): Promise<Result<void>>`
  - `deleteFile(path): Promise<Result<void>>`
- Normalize filesystem errors into stable error codes and messages.
- Treat deleting a non-existent file as a successful operation.

### Non-Responsibilities

- Does **not** own **atomic** write semantics (temp file + fsync + rename):
  - That responsibility lives in the AtomicWrite stack.
- Does **not** perform directory creation; callers must ensure parent directories exist.
- Does **not** encode project-based layout rules (delegated to `ProjectPathResolver` / `StoragePaths`).
- Does **not** enforce permissions beyond what the OS and higher-level modules provide.
- Does **not** perform retries, backoff, or cross-device file moves.

## 3. Public API

> This section describes the conceptual API. The exact signatures live in
> `src/core/storage/modules/FileStorage.ts` and must remain compatible with this spec.

### Types

- `interface FileStorage {`
  - `readFile(path: string): Promise<Result<Buffer>>`
  - `readText(path: string): Promise<Result<string>>`
  - `writeFile(path: string, data: Buffer): Promise<Result<void>>`
  - `writeText(path: string, text: string): Promise<Result<void>>`
  - `deleteFile(path: string): Promise<Result<void>>`
  - `}`

- `type FileErrorCode =`
  - `"FILE_READ_FAILED"` |
  - `"FILE_WRITE_FAILED"` |
  - `"FILE_DELETE_FAILED"`

### Behavior

- `readFile(path)`:
  - Uses Node's `fs.promises.readFile` or equivalent.
  - On success: returns `Ok<Buffer>`.
  - On failure: returns `Err` with `FILE_READ_FAILED`.

- `readText(path)`:
  - Reads a file as UTF-8 text.
  - On success: returns `Ok<string>`.
  - On failure: returns `Err` with `FILE_READ_FAILED`.

- `writeFile(path, data)`:
  - Writes a file in one operation using `fs.promises.writeFile` or equivalent.
  - On success: returns `Ok<void>`.
  - On failure: returns `Err` with `FILE_WRITE_FAILED`.

- `writeText(path, text)`:
  - Writes UTF-8 text to a file in one operation.
  - On success: returns `Ok<void>`.
  - On failure: returns `Err` with `FILE_WRITE_FAILED`.

- `deleteFile(path)`:
  - Attempts to remove a file.
  - If the file does not exist (`ENOENT`), returns `Ok<void>` (idempotent delete).
  - If deletion fails for other reasons, returns `Err` with `FILE_DELETE_FAILED`.

### Atomicity clarification

- The methods above do **not** guarantee atomic semantics beyond what the OS guarantees for `writeFile`.
- The repo's **atomic write pipeline** is implemented by the AtomicWrite stack:
  - Uses temp paths, rename, and sync to achieve atomicity.
  - Composes on top of `FileStorage` and other low-level primitives.
- Callers that require atomic semantics MUST use the AtomicWrite stack, not `FileStorage` directly.

## 4. Internal Model and Invariants

### Invariants

- All methods are asynchronous and return `Result`:
  - No expected filesystem error should propagate as a thrown exception.
- `deleteFile` is idempotent:
  - Calling it repeatedly on the same path should remain a success after the file is gone.
- The module does not maintain any internal cache or open file handles beyond the lifetime of individual calls.

### Encoding and decoding

- `readText` / `writeText` use UTF-8 encoding:
  - Other encodings are not supported by this module.
  - If additional encodings are required in the future, they MUST be added to this spec.

## 5. Planned vs Implemented

### Current status

- **Lifecycle status**: `Implemented`
  - Implementation exists at `src/core/storage/modules/FileStorage.ts`.
  - Tests exist at `tests/core/fileStorage.test.ts`.
  - Basic functionality (read/write/delete and idempotent delete) is exercised.

### Planned

- Potential enhancements:
  - More detailed error codes (e.g. permission vs disk-full vs path-invalid).
  - Additional convenience helpers (e.g. JSON read/write).
- Atomic write semantics:
  - Will remain the responsibility of the AtomicWrite stack.
  - If a future design requires FileStorage-level atomic helpers, that must be explicitly added here and implemented accordingly.

## 6. Dependencies

### Upstream dependencies

`core.storage.FileStorage` depends on:

- Node's filesystem APIs (`fs.promises` or equivalent).
- Core types for `Result` and error modeling (from `core.foundation` or an equivalent shared utility module).

It MUST NOT depend on:

- `ProjectModel`, `ProjectRegistry`, or `ProjectPathResolver`.
- Higher-level blocks (`core.runtime`, `core.permissions`) or feature modules.

### Downstream dependents

Expected consumers include:

- The AtomicWrite stack (AtomicWriteService, AtomicWriteExecutor, etc.).
- `ProjectRegistry` and other storage modules when performing simple file operations.
- Any module that needs to read/write arbitrary files within the storage root.

## 7. Error Model

Public methods return `Result` objects:

- On success: `Ok<T>`.
- On failure: `Err` with:
  - `code`: one of the `FileErrorCode` values.
  - `message`: human-readable context (e.g. `"Failed to read file at path ..."`)
  - Optional underlying error/stack in diagnostics-only fields.

Behavioral guarantees:

- File not found on `deleteFile` is **not an error**.
- Any filesystem error on read/write should be converted to a `FILE_READ_FAILED` / `FILE_WRITE_FAILED` with useful context.

If more detailed error codes are introduced, this spec MUST be updated accordingly.

## 8. Testing Strategy

Tests MUST cover:

- `writeFile` + `readFile`:
  - Writing and reading back binary data.
- `writeText` + `readText`:
  - Writing and reading back text, verifying UTF-8 behavior.
- `deleteFile`:
  - Deleting an existing file.
  - Deleting a non-existent file returns success.
- Error scenarios:
  - Attempting to read a missing file returns `FILE_READ_FAILED`.
  - Attempting to write to a path with an invalid directory or permissions returns `FILE_WRITE_FAILED` (where feasible in tests).

Existing tests:

- `tests/core/fileStorage.test.ts`
  - Exercises basic read/write/delete/double-delete flows using real temp directories.

As new behaviors are added (e.g. structured error codes), tests MUST be extended.

## 9. Performance Considerations

- `FileStorage` operations are primarily IO-bound.
- No additional buffering or caching is introduced by this module; it delegates to Node's filesystem primitives.
- It should be efficient enough for typical project operations; any heavy workloads should consider batching or streaming at a higher level.

There is no dedicated performance budget entry for `FileStorage`; it is implicitly included in:

- Core storage operation budgets (project open/save).
- Any feature-level budgets that rely on storage.

## 10. CI / Governance Integration

Any change to:

- The public API of `FileStorage`.
- The error codes or semantics of read/write/delete.
- The relationship between `FileStorage` and the AtomicWrite stack.

MUST:

- Update this spec first.
- Update the implementation in `src/core/storage/modules/FileStorage.ts`.
- Update or add tests in `tests/core/fileStorage.test.ts`.
- Keep the `core.storage` block spec and any references in `_AI_STORAGE_ARCHITECTURE` in sync with the actual behavior.
- Ensure `npm run spec:check` passes from the monorepo root.

AI agents and humans MUST follow `_AI_MASTER_RULES.md` and the Spec Workflow Guide when evolving this module, keeping specs, implementation, and inventory aligned.
