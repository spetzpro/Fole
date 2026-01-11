# Module: core.ux.shell.SafeMode

## Module ID
core.ux.shell.SafeMode

## 1. Purpose

Safe Mode is a designated, highly visible runtime state in which the application serves a configuration known to be invalid or non-compliant (Severity A1). It allows developers and operators to test "broken" configurations in a controlled environment without taking the entire service offline.

It acts as an **explicit override** rather than an error recovery mechanism.

## 2. Entry Conditions

The system enters Safe Mode ONLY via deliberate, authenticated action. It is never accidental.

1.  **Forced "Invalid" Deployment**:
    -   User invokes `POST /api/config/shell/deploy` with `forceInvalid=true`.
    -   The payload contains **A1 Severity Errors** (e.g., missing schema fields).
    -   **ModeGate** approves the request (requiring Developer Mode active).

2.  **Explicit State**:
    -   The `active.json` pointer explicitly flags `safeMode: true`.
    -   Example:
        ```json
        {
          "activeVersionId": "v1736636...",
          "safeMode": true,
          "activatedByMode": "developer",
          "safeModeReason": "Forced deployment of invalid configuration (DEV mode).",
          "safeModeReport": { ... }
        }
        ```

## 3. Operational Guarantees

While in Safe Mode, the following guarantees hold:

### 3.1 Availability
-   The server **remains running**.
-   The API endpoints `/api/config/shell/bundle` and `/api/config/shell/status` continue to serve requests, returning the invalid bundle and the Safe Mode status respectively.
-   Deployment (`/deploy`) and Rollback (`/rollback`) APIs remain fully functional to allow recovery.

### 3.2 Visibility
-   **Server-Side**: The `active.json` file contains the full validation report explaining *why* the config is invalid.
-   **Client-Side**: Any client consuming the bundle MUST detect the `safeMode` flag (via status API or bundled meta) and display a persistent warning banner used to warn developers that the UI may be unstable.

### 3.3 Persistence
-   Safe Mode persists across server restarts. It is backed by the `active.json` file on disk.
-   Restarting the process DOES NOT revert to a previous version or exit Safe Mode.

## 4. Non-Goals

-   **NOT Automatic Recovery**: The system does NOT enter Safe Mode automatically when a crash occurs.
-   **NOT Silent**: Validation errors are never suppressed; they are acknowledged and stored in `safeModeReport`.
-   **NOT a Bypass**: Safe Mode does not bypass the *validation logic*; it bypasses the *rejection logic*. The validation report is still generated and stored.

## 5. Exit Strategies

Safe Mode is designed to be temporary.

1.  **Valid Deployment (Fix Forward)**:
    -   Deploying a new bundle that has **Zero A1 Errors** automatically sets `safeMode: false` in `active.json`.

2.  **Rollback (Revert)**:
    -   Invoking `POST /api/config/shell/rollback` to a previous version forces `safeMode: false`.

## 6. Related Specifications

-   **[ShellConfigGovernance](core.ux.shell.ShellConfigGovernance.md)**: Defines the Developer Mode permissions required to enter Safe Mode.
-   **[ShellConfigValidation](core.ux.shell.ShellConfigValidation.md)**: Defines the A1 errors that normally block deployment but are permitted in Safe Mode.
-   **[ShellConfigDeployAndRollback](core.ux.shell.ShellConfigDeployAndRollback.md)**: Defines the API mechanics for entering and exiting this state.
-   **[ModesAdvancedDeveloper](core.ux.shell.ModesAdvancedDeveloper.md)**: Context for the environment in which Safe Mode is utilized.

