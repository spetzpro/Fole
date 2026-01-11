# Block: core.ux.shell

## Block ID
core.ux.shell

## 1. Overview
The **Core UX Shell** is not a single UI component but a governed collection (Bundle) of blocks that define the application's comprehensive frame. It establishes the global layout, navigation, and theming constraints within which all other blocks (Features) reside.

Because the shell controls the primary user interface and application stability, it is subject to strict governance rules managed by the `core.ux.shell.*` modules.

## 2. Core UX Shell Taxonomy

The Shell Bundle MUST contain the following block types. These form the immutable skeleton of the application.

### 2.1 Structural Regions

| Block Type (`blockType`) | Purpose | Required? | Structural Lock |
| :--- | :--- | :--- | :--- |
| `shell.region.header` | Global navigation bar and identity area. | **YES** | **Locked** (Cannot delete) |
| `shell.region.footer` | Compliance links, version info, global status. | **YES** | **Locked** (Cannot delete) |
| `shell.rules.viewport` | Responsive breakpoints and layout constraints. | **YES** | **Locked** (Immutable in Normal) |

### 2.2 Core Controls

| Block Type (`blockType`) | Purpose | Required? | Structural Lock |
| :--- | :--- | :--- | :--- |
| `shell.control.button.help` | Global "Help" access point. | **YES** | **Locked** (Cannot delete) |
| `shell.control.button.window_manager` | Toggles for panels/windows management. | **YES** | **Locked** (Cannot delete) |
| `shell.control.button.main_menu` | Trigger for the primary navigation overlay. | **YES** | **Locked** (Cannot delete) |

### 2.3 Core Overlays

| Block Type (`blockType`) | Purpose | Required? | Structural Lock |
| :--- | :--- | :--- | :--- |
| `shell.overlay.main_menu` | The primary navigation menu container. | **YES** | **Locked** |
| `shell.overlay.advanced_menu` | Access to heavy tooling/settings. | **Optional** | Floating (Defaults to Hidden) |

### 2.4 Infrastructure

| Block Type (`blockType`) | Purpose | Required? | Structural Lock |
| :--- | :--- | :--- | :--- |
| `shell.infra.routing` | JSON-based route definitions & deep links. | **YES** | **Locked** |
| `shell.infra.theme_tokens` | Global CSS/theme variables (colors/typo). | **YES** | **Locked** |

Required shell blocks MUST exist in the bundle AND MUST be referenced by the active `shell.manifest.json`. Missing required blocks or missing manifest references are A1 validation failures.

## 3. Editability & Governance Matrix

The Core UX Shell enforces a strict "Tiered Editability" model to prevent users from breaking the application frame.

### 3.1 Mode Definitions
-   **Normal Mode**: Standard administrative user.
-   **Advanced Mode**: Power user (Defined in `ModesAdvancedDeveloper`).
-   **Developer Mode**: System engineer with `FOLE_DEV` flags enabled.

### 3.2 Editability Rules

| Block Category | Normal Mode | Advanced Mode | Developer Mode |
| :--- | :--- | :--- | :--- |
| **Header / Footer** | **Content Safe-Edit Only**<br>(e.g., Change text label, Toggle visibility of sub-items).<br>*Cannot move/delete.* | **Risk-Edit Allowed**<br>(e.g., Reorder inner items).<br>*Cannot delete block.* | **Full Access**<br>(may force invalid only via `forceInvalid` and will enter Safe Mode; gated by ModeGate + env flags). |
| **Core Buttons** | **Read Only**.<br>Positioning may be fixed by theme. | **Read Only**.<br>Visibility toggling allowed if non-fatal. | **Structural Edit**.<br>Can remove/replace actions. |
| **Routing** | **Safe Edit Allowed**<br>(e.g., rename labels, reorder visible routes, enable/disable existing entries).<br>*Cannot delete the routing block.* | **Risk-Edit Allowed**<br>(e.g., add/modify routes and aliases; manage published links).<br>*Cannot delete the routing block.* | **Full Access**<br>(can restructure routing model; may force invalid via `forceInvalid` with ModeGate + env flags). |
| **Theme Tokens** | **Value Edit Only**.<br>Change "Blue" to "Red". | **Value Edit Only**. | **Schema Edit**.<br>Add new tokens. |
| **Viewport Rules** | **Read Only**. | **Read Only**. | **Full Access**. |

## 4. Governance Modules

The Core UX Shell is validated, stored, and deployed via a dedicated governance system described in the following Module Specifications. 

All changes to the blocks listed in Section 2 must pass the **ShellConfigValidation** gates before becoming active.

-   **[ShellConfigGovernance](../modules/core.ux.shell/core.ux.shell.ShellConfigGovernance.md)**:
    -   Defines the policies for Safe Mode and Developer Mode overrides.
-   **[ShellConfigStorage](../modules/core.ux.shell/core.ux.shell.ShellConfigStorage.md)**:
    -   Defines how these blocks are serialized to `shell.manifest.json` and block files in the `config/shell/` directory.
-   **[ShellConfigValidation](../modules/core.ux.shell/core.ux.shell.ShellConfigValidation.md)**:
    -   Defines the A1/A2/B severity rules that police the "Structural Lock" column in Section 2.
-   **[ShellConfigDeployAndRollback](../modules/core.ux.shell/core.ux.shell.ShellConfigDeployAndRollback.md)**:
    -   Governs the atomic API for updating these blocks.
-   **[SafeMode](../modules/core.ux.shell/core.ux.shell.SafeMode.md)**:
    -   The state entered if Developer Mode forces a layout that breaks the Shell Taxonomy.
-   **[ModesAdvancedDeveloper](../modules/core.ux.shell/core.ux.shell.ModesAdvancedDeveloper.md)**:
    -   Defines the technical implementation of the "Advanced" and "Developer" personas referenced in Section 3.
