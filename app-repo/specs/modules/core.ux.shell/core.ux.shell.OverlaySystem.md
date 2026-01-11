# Module: core.ux.shell.OverlaySystem

## Module ID
core.ux.shell.OverlaySystem

## 1. Purpose and Scope

The **Overlay System** manages ephemeral User Interface surfaces that exist "above" the standard windowing layer. Unlike Windows, Overlays are transient, do not participate in physics or workspace persistence, and are designed for quick interactions such as navigation, context selection, or critical system notifications.

### 1.1 Scope
-   **Ephemeral Nature**: Overlays are temporary. They appear to perform a task and disappear when dismissed or when focus is lost.
-   **Layering**: All overlays render at a Z-Index higher than the Window System but lower than System Toasts or Critical Error Dialogs.
-   **Governance**: Defines the allowable types of overlays and their triggering mechanisms via the shell configuration.

### 1.2 Out of Scope
-   **Windows**: Persistent, movable containers are governed by [WindowSystem](core.ux.shell.WindowSystem.md).
-   **Content**: The specific internal rendering of a menu or dropdown is handled by the `core.ui` block definitions, not the shell overlay controller.

## 2. Overlay Taxonomy

The shell recognizes specific categories of overlays, each with distinct behaviors defined in the Shell Bundle.

### 2.1 Major Overlay Types

| Type | Examples | Persistence | Dismissal |
| :--- | :--- | :--- | :--- |
| **Global Menus** | `shell.overlay.main_menu`, `shell.overlay.advanced_menu` | None | Click-outside, ESC, Explicit Toggle |
| **Context Menus** | Right-click actions, specific tool options | None | Click-outside, Selection made |
| **Dropdowns/Popovers** | Filters, comboboxes attached to UI elements | None | Click-outside, Element blur |
| **System Banners** | **Safe Mode** warning strip, Connection Loss | System State | Persistent while condition is true |

### 2.2 Registry
Like Windows, structural overlays (e.g., Main Menu) MUST be declared as blocks in the active shell bundle with `blockType: shell.overlay.*`.

Identifier rule: `toggleOverlay.overlayId` MUST match the `blockId` of a declared `shell.overlay.*` block in the active bundle (overlayId == blockId). Unknown overlayIds are treated as A1-invalid at validation time for core shell bundles.

-   **Block Type**: `shell.overlay.*`
-   **Identifier**: A unique `overlayId` used by the actions system to target it.

## 3. Lifecycle and Behavior

### 3.1 Triggering
Overlays are typically instantiated by:
1.  **User Action**: A `toggleOverlay` action triggered by a button click (defined in [ButtonActionModel](core.ux.shell.ButtonActionModel.md)).
2.  **System Event**: The Shell entering "Safe Mode" triggers the `safe_mode_banner` overlay automatically.
3.  **Context Event**: Right-clicking a valid surface triggers a context menu overlay.

### 3.2 Dismissal ("Light Dismiss")
Standard overlays adhere to "Light Dismiss" logic:
-   **Click Outside**: Clicking anywhere on the screen *except* the overlay or its trigger button closes the overlay.
-   **ESC Key**: Pressing Escape closes the topmost ephemeral overlay.
-   **Route Change**: Navigating to a new route typically closes all open menus.

### 3.3 Stacking Order
Overlays are managed in a separate stacking context from windows.
1.  **Top**: Critical System Banners (e.g., Safe Mode).
2.  **Middle**: Active Dropdowns / Context Menus (nested).
3.  **Bottom**: Global Menus (Main Menu).
4.  *(Window Layer is below all execution)*

## 4. Persistence Rules

### 4.1 No Workspace Persistence
Overlays are **NEVER** persisted in the Workspace Session state ([WorkspacePersistence](core.ux.shell.WorkspacePersistence.md)).
-   Reloading the page MUST restore the shell to a "clean slate" visually (menus closed).
-   **Rationale**: Overlays are mode-less and transient. Restoring a menu on reload is confusing and obscures the workspace usage context.

### 4.2 State-Driven Exceptions
System Banners are "pseudo-persistent" because they reflect an underlying boolean state of the application.
-   *Example*: If `isSafeMode == true`, the Safe Mode banner renders on startup. It is not "remembered" layout state, but a reflection of the `SafeMode` service state.

## 5. Governance and Safety

### 5.1 Fail-Closed Registry
The Shell Validation system enforces a strict registry for structural overlays.
-   An action requesting `toggleOverlay(overlayId: "magic_menu")` will **no-op (fail-closed) and MUST be logged as a diagnostics event (client toast optional)** if "magic_menu" is not explicitly defined in the active bundle.
-   There are no "implicit" overlays allowed in the Core Shell.

### 5.2 Safe Mode Restrictions
When the application enters **Safe Mode**:
1.  **Restricted Execution**: Only "Critical" overlays (e.g., Help, Diagnostic Export) are permitted to open.
2.  **Visual Indication**: The Safe Mode Banner overlay is forced to be visible and un-dismissible.
3.  **Complex Overlays**: High-memory overlays (like 3D plotters in a popup) are disabled to prevent crashing.

## 6. Interaction with Other Systems

### 6.1 Button Action Model
-   **Action**: `toggleOverlay`
-   **Parameter**: `overlayId` (string)
-   **Validation**: Checked against the Overlay Registry in the bundle.

### 6.2 Routing Resolution
-   Menu overlays serve as the primary host for navigation buttons.
-   The overlay itself is just a container; the links inside trigger the `RoutingResolution` system.

## 7. Related Specifications

-   **[ButtonActionModel](core.ux.shell.ButtonActionModel.md)**: Defines the actions that trigger these overlays.
-   **[WindowSystem](core.ux.shell.WindowSystem.md)**: Defines the persistent layer that lives *beneath* overlays.
-   **[RoutingResolution](core.ux.shell.RoutingResolution.md)**: Defines what happens when menu items are clicked.
-   **[SafeMode](core.ux.shell.SafeMode.md)**: Governance for restricting UI during critical failures.
