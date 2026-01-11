# Module: core.ux.shell.ModesAdvancedDeveloper

## Module ID
core.ux.shell.ModesAdvancedDeveloper

## 1. Purpose

This specification defines the restricted operational modes—**Advanced Mode** and **Developer Mode**—that grant elevated privileges beyond standard user operations. These modes are controlled by the `ModeGate` implementation to ensure that dangerous operations (like forcing invalid configurations) are strictly contained and authorized.

## 2. Mode Definitions

### 2.1 Advanced Mode (Reserved)
**Status**: Currently DISABLED (Fail-closed).

-   **Definition**: A privileged state intended for power users to perform risky but non-destructive operations on non-core blocks (e.g., experimental feature toggles, raw JSON edits on user blocks).
-   **Capabilities**:
    -   Can edit non-critical block properties.
-   **Restrictions**:
    -   Currently has no operational effect because `ModeGate.canUseAdvancedMode(ctx)` is hardcoded to return false.
    -   **CANNOT** force invalid shell deployments.
    -   **CANNOT** modify Core UX Shell structure.
    -   **Does NOT** require a server-side flag (managed via standard RBAC/Permissions in the future).

### 2.2 Developer Mode
**Status**: ACTIVE (Conditional).

-   **Definition**: A highly privileged state intended for system integrators and engineers to modify the Core UX Shell itself, including applying structurally invalid states for testing resilience.
-   **Capabilities**:
    -   **Can** invoke `POST /api/config/shell/deploy` with `forceInvalid=true`.
    -   **Can** trigger entry into **Safe Mode**.
-   **Requirements (AND Condition)**:
    1.  **Server Flag**: The server process must be started with explicit environment variable overrides.
    2.  **Origin Check**: The request must originate from `localhost` (in current implementation).
    3.  **App Permission**: The user context must have the `sys.admin` or equivalent system role (Future RBAC).

## 3. Implementation Reality (ModeGate)

The `ModeGate` class is the authoritative enforcer of these rules.

### 3.1 Developer Mode Gates
To successfully enter Developer Mode context (e.g., to force an invalid deployment), the following conditions MUST be met simultaneously:

1.  **Localhost Origin**: The request IP must be `127.0.0.1` or `::1`.
2.  **Environment Variable 1**: `FOLE_DEV_ALLOW_MODE_OVERRIDES=1` (Enables the override system).
3.  **Environment Variable 2**: `FOLE_DEV_FORCE_INVALID_CONFIG=1` (Explicitly allows invalid configurations).

*If any condition is missing, `ModeGate` returns `false`, and the operation is rejected (HTTP 403).*

### 3.2 Advanced Mode Gates
Currently hardcoded to return `false`.

## 4. Non-Goals

-   **No Client-Side Toggles**: Modes are never activated purely by a client-side setting. The server `ModeGate` always arbitrates.
-   **No Silent Escalation**: A user in "Advanced Mode" cannot implicitly gain "Developer Mode" privileges.
-   **No Config Persistence**: The mode state itself is not stored in `shell.manifest.json` or `config/shell/`. It is ephemeral to the deployment request or runtime environment.

## 5. Related Specifications

-   **[ShellConfigGovernance](core.ux.shell.ShellConfigGovernance.md)**: Defines the policy rules that use these modes.
-   **[ShellConfigDeployAndRollback](core.ux.shell.ShellConfigDeployAndRollback.md)**: The primary consumer of Developer Mode (via the `forceInvalid` flag).
-   **[SafeMode](core.ux.shell.SafeMode.md)**: The resulting system state when Developer Mode is used to deploy invalid config.
