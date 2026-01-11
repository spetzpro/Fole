# Module: core.ux.shell.ShellConfigGovernance

## Module ID
core.ux.shell.ShellConfigGovernance

# Module: core.ux.shell.ShellConfigGovernance

## Module ID
core.ux.shell.ShellConfigGovernance

## 1. Purpose
The Governance module defines the authoritative rules for the Shell Configuration system. It establishes "what represents a valid state" for the application shell and enforces strict constraints on how that state can change.

Its primary purpose is to ensure the application cannot enter a broken state during normal operation, while providing controlled escape hatches for advanced debugging.

## 2. Definitions

- **Shell Bundle**: The atomic unit of deployment. Contains a `shell.manifest.json` and a collection of Block definitions. It is not a single object but a "bundle of blocks".
- **Manifest**: The root file (`shell.manifest.json`) describing the shell layout, regions, and references to Block IDs.
- **Active Pointer (`active.json`)**: A small JSON file that serves as the single source of truth for the currently running configuration version.
- **Archive**: The immutable history of deployed bundles, stored as `archive/<versionId>/`.
- **Safe Mode**: A specific system state where the application runs with reduced functionality because the configuration was forced to be invalid (Developer Mode only) or failed to load.

## 3. Governance Principles

1. **Server Authoritative**: The server file system (`active.json`) is the absolute source of truth. Clients must synchronize to this state.
2. **Fail-Closed**: If a configuration is invalid (A1 severity) or ambiguous, deployment is rejected securely.
3. **Rollback-First**: Recovery from bad states is achieved by rolling back the pointer to a known-previous version, not by hot-fixing the current one.
4. **Atomic Activation**: Changes to the active configuration happen instantly via file system atomic rename. Partial states are impossible.

## 4. Versioning Model

- **Version IDs**: Timestamp-based IDs (e.g., `v1736630000000`) generated at deployment time.
- **Persistence**: 
  - Every deployment creates a new folder in `archive/<versionId>/`.
  - This folder contains copies of the `bundle` contents, a `meta.json` (deployment metadata), and `validation.json` (validation report).
- **Active State**:
  - The system reads `active.json` to know which Version ID is live.
  - If `active.json` is missing, the system falls back to hardcoded internal defaults (Emergency Mode) or fails to start.

## 5. Validation Severity Model

The system categorizes validation findings into three tiers:

- **A1 (Fatal/Blocking)**:
  - **Meaning**: The configuration is structurally invalid or missing required dependencies (e.g., manifest references a Block that is not in the bundle).
  - **Action**: Deployment is **REJECTED** immediately.
  - **Exception**: Can only be deployed if Developer Mode is active and "Force Invalid" is explicitly requested.

- **A2 (Critical/Warning)**:
  - **Meaning**: The configuration is technically valid but uses deprecated features or risky patterns.
  - **Action**: Deployment allowed, but warnings are logged and surfaced to the admin.

- **B (Informational)**:
  - **Meaning**: Stylistic issues or suggestions (unused descriptions, etc.).
  - **Action**: Deployment allowed silently.

## 6. Activation Rules

- **Normal Activation**: 
  - Requires Validation Status = `valid` (0 A1 errors).
  - Updates `active.json` with `{ "safeMode": false, "mode": "normal" }`.

- **Forced Activation ("Force Invalid")**:
  - **Pre-requisite**: 
     1. Request originates from `localhost`.
     2. `FOLE_DEV_FORCE_INVALID_CONFIG=1` environment variable is set.
     3. `FOLE_DEV_ALLOW_MODE_OVERRIDES=1` environment variable is set.
  - **Behavior**: 
     - Updates `active.json` with `{ "safeMode": true, "mode": "developer" }`.
     - System enters **Safe Mode**.

- **Rollback Activation**:
  - Verification: Target version must exist in `archive/`.
  - Behavior: Updates `active.json` to point to target. Resets `safeMode` to `false`.

## 7. Client Contract

- **State Sync**: The client queries `/api/shell/status` to determine the active version.
- **No Auto-Reload**: The server does NOT force clients to reload when `active.json` changes. Clients may choose to poll or reload on next navigation.
- **Safe Mode UI**: If the server reports `safeMode: true`, the client MUST display a persistent warning banner ("Developer Safe Mode Enabled").

## 8. Related Specs

This governance model is enforced by the logic defined in:

- **core.ux.shell.ShellConfigStorage**: Handles the atomic file write operations.
- **core.ux.shell.ShellConfigValidation**: Implements the A1/A2/B severity logic using schemas.
- **core.ux.shell.ShellConfigDeployAndRollback**: Orchestrates the API calls and version management.
- **core.ux.shell.ModesAdvancedDeveloper**: Defines the environment variable gates for overriding validation.
- **core.ux.shell.SafeMode**: Defines the runtime behavior when `safeMode` is active.
