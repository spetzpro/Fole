# Module: core.ux.shell.ShellConfigStorage

## Module ID
core.ux.shell.ShellConfigStorage

## 1. Overview
Handles the low-level persistence of configuration files. This module abstracts the file system and ensures atomic write operations to prevent corruption.

## 2. Inputs and Outputs
- **Input**: Config objects to be persisted.
- **Output**: File system operations (Write, Rename, Delete).

## 3. Data Formats
- Uses standard JSON serialization.
- Manages `.prev` and `.next` file extensions for atomicity.

## 4. Error Handling
- Handles file system errors (EACCES, ENOENT).
- Retries on transient locking issues.

## 5. Security Notes
- Enforces strict file permissions (read-only for non-admin processes).
- Prevents path traversal via config keys.

## 6. Implementation Notes
- TODO: Specify locking mechanism.
