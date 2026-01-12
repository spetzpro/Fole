# Module: core.ux.shell.SysadminUi
Version: SPEC_V1.0
Last-Updated: 2026-01-12

## Module ID
core.ux.shell.SysadminUi

## 1. Purpose & Scope

The **Sysadmin UI** is the built-in control plane for managing the Shell Configuration. It allows authorized administrators to inspect, modify, validate, and deploy system blocks without direct database or file system access.

### 1.1 Objectives
-   **Safe Management**: Provides a governed interface for configuration, preventing syntax errors and invalid references through validation gates.
-   **Transparency**: Exposes the relationship between blocks (bindings, references) to prevent orphaned dependencies.
-   **Controlled Evolution**: Enforces the [ShellConfigGovernance](core.ux.shell.ShellConfigGovernance.md) lifecycle (Validation, Deployment, Rollback) via UI flows.

### 1.2 Constraints
-   **No Arbitrary Scripts**: The UI does not execute user-provided JavaScript.
-   **Gated Editing**: Raw JSON editing is restricted based on the active administrative mode.

## 2. Core Screens & Flows

### 2.1 Block Explorer
The entry point for configuration management.
-   **List View**: Paginated list of all blocks in the current bundle.
-   **Filtering**: Filter by `blockType`, `schemaVersion`, or status (e.g., "Modified", "New").
-   **Search**: Full-text search on `blockId` and `data.label`.

### 2.2 Block Inspector
A detailed view of a selected block.
-   **Envelope Metadata**: Displays `blockId`, `blockType`, `version` (read-only in standard view).
-   **Data View**: Form-based or Tree-based viewer for the `data` payload.
-   **References Panel**: Lists all blocks that reference this block (incoming) and blocks this block references (outgoing).
-   **Bindings Chip**: A visual indicator ("Bindings: N") linking to the [BindingSystem](core.ux.shell.BindingSystem.md) inspector for this block.

### 2.3 Validation Panel
Real-time feedback on configuration health.
-   **Report Rendering**: Displays validation results categorized by severity (A1 = blocking; A2/B = non-blocking when present).
-   **Navigation**: Clicking an error navigates directly to the offending block/field.

### 2.4 Deploy Flow
-   **Standard Deploy**:
    1.  User clicks "Deploy Changes".
    2.  System runs full validation.
    3.  If valid, commits bundle and promotes to Active.
-   **Force Deploy (Developer Mode)**:
    1.  Enabled only in Developer Mode.
    2.  Allows deploying despite A1/A2 errors (triggers [SafeMode](core.ux.shell.SafeMode.md)).
    3.  Requires explicit confirmation modal: "This will degrade the system to Safe Mode."

### 2.5 Rollback Flow
-   **Version Selection**: List of previous Deployment IDs with timestamps and authors.
-   **Impact Analysis**: Diff view showing changed blocks between current and target version.
-   **Confirmation**: "Revert to V-{hash}".

## 3. Mode Gating Behaviors

The UI adapts to the active [ModesAdvancedDeveloper](core.ux.shell.ModesAdvancedDeveloper.md) state.

| Feature | Normal Mode | Advanced Mode | Developer Mode |
| :--- | :--- | :--- | :--- |
| **Edits** | Safe fields only (Labels, Order, Tokens) on Core blocks. | JSON Editor allowed for non-core blocks. | Full structural edits on all blocks. |
| **Raw JSON** | Disabled (Form View only). | Enabled (with schema validation). | Enabled (Unrestricted). |
| **Create/Delete** | Restricted types. | Most types. | All types. |
| **Deploy** | Must be Valid (A1/A2 = Block). | Must be Valid (A1 = Block). | Force Invalid Allowed. |
| **Visual Cues** | Standard theme. | Amber status bar. | Red/Hazard status bar. |

## 4. Block Operations

-   **Create**: Wizard-based creation using templates for common block types.
-   **Clone**: "Save As" functionality to duplicate an existing block with a new `blockId`.
-   **Edit**:
    -   modifications add the block to the "Staged" change set.
    -   Validation runs strictly against the Staged set.
-   **Delete**:
    -   **Soft Delete**: Marks block for removal in the next deploy.
    -   **Referential Integrity**: Deletion is blocked if other blocks reference the target, unless "Cascade Delete" (Future) is authorized or references are removed first.
-   **View Bindings**:
    -   Bidirectional inspection of the [BindingSystem](core.ux.shell.BindingSystem.md) graph.
    -   Filters triggers and derived bindings attached to the current block.

## 5. Live Update Behavior

The Sysadmin UI allows hot-configuration provided it does not disrupt active user sessions.

-   **Updates**: When a new bundle is deployed, connected clients rely on `ShellConfig` polling or websocket notification.
-   **No Force Reload**: The UI MUST NOT force a browser refresh.
-   **Notification**: A banner appears: "Configuration updated. Reload to apply."
-   **Safe Mode**: If the system enters Safe Mode (due to a bad deploy), a persistent red banner warns all users, and admin tools remain accessible for recovery.

## 6. Cross-References

-   [core.ux.shell.ShellConfigGovernance](core.ux.shell.ShellConfigGovernance.md)
-   [core.ux.shell.ShellConfigDeployAndRollback](core.ux.shell.ShellConfigDeployAndRollback.md)
-   [core.ux.shell.SafeMode](core.ux.shell.SafeMode.md)
-   [core.ux.shell.ModesAdvancedDeveloper](core.ux.shell.ModesAdvancedDeveloper.md)
-   [core.ux.shell.BindingSystem](core.ux.shell.BindingSystem.md)
-   [core.ux.shell.TemplateSystem](core.ux.shell.TemplateSystem.md)
