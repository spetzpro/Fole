# Block: core.ux.shell

## Block ID
core.ux.shell

## 1. Purpose

The `core.ux.shell` block governs the application's runtime configuration shell, deployment lifecycle, and mode management (safe mode, develop mode). It provides the system-level interface for administrators and developers to manage the application state without modifying the core codebase directly.

It is responsible for:
- **Shell Configuration**: Managing `active.json` atomic configuration states.
- **Deployment & Rollback**: Orchestrating safe transitions between configuration versions.
- **Validation**: Enforcing strict schema compliance (A1/A2/B severity) for all config changes.
- **Mode Gates**: Managing access to advanced developer tools and "Force Invalid" capabilities.
- **Safe Mode**: Providing a fail-safe state when configuration is corrupted or invalid.

It is not responsible for:
- Runtime retrieval of standard config values (handled by `core.foundation.ConfigService`).
- User-level preferences or UI state.
- Authentication logic.

## 2. Scope and Non-Scope

### In scope
- Atomic deployment of server-side JSON configuration.
- Validation logic for preventing invalid system states.
- Management of `active.json`, `active.json.prev`, and `active.json.next` pointers.
- Server-side "Safe Mode" failover logic.
- Developer-only overrides (Force Invalid).

### Out of scope
- Application business logic configuration (e.g., feature specific settings not part of the shell).
- Client-side routing.

## 3. Block Decomposition

`core.ux.shell` is decomposed into the following modules:

| Module ID | Responsibility | Status |
|-----------|----------------|--------|
| `core.ux.shell.ShellConfigGovernance` | Rules for what constitutes a valid configuration. | Specced |
| `core.ux.shell.ShellConfigStorage` | Atomic file system operations for config management. | Specced |
| `core.ux.shell.ShellConfigValidation` | Schema validation and severity classification (A1/A2/B). | Specced |
| `core.ux.shell.ShellConfigDeployAndRollback` | Orchestration of deploy/rollback actions. | Specced |
| `core.ux.shell.ModesAdvancedDeveloper` | Developer-specific features and overrides. | Specced |
| `core.ux.shell.SafeMode` | Fail-safe behavioral definitions. | Specced |
