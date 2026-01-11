# Module: core.ux.shell.WindowSystem

## Module ID
core.ux.shell.WindowSystem

## 1. Purpose

This module defines the behavior, lifecycle, and physics model of the Window System within the Core UX Shell. Unlike static regions or ephemeral overlays, Windows are physics-enabled containers that allow users to spatially organize tools and data.

## 2. Scope

This specification governs:
-   The definition of a "Window" versus other shell surfaces.
-   The identity model (`windowKey` and instance management).
-   The canonical state schema for persistence.
-   The tab-scoped workspace state management.
-   The physics and boundary rules for window movement.
-   **Out of Scope**: The specific internal content of a window (handled by the content block), and the handling of Header/Footer regions (which are stable and non-physical).

## 3. Core Concepts

### 3.1 Windows vs. Other Surfaces
-   **Windows**: Physics-enabled, persistent containers residing strictly within the **Viewport** region. They have mutable position, size, and stacking order.
-   **Header/Footer**: Stable, non-physical surfaces. Windows cannot occlude or interact with these regions physically (they are bounded *between* them).
-   **Overlays**: Ephemeral UI (menus, dropdowns, toasts) that exists above the window layer. They are not windows and do not participate in physics.

### 3.2 Window Identity
-   **Window Key**: The unique, explicit identifier for a window type (e.g., `tool_inspector`, `chat_panel`). Never inferred from content.
-   **Instance ID**: A unique runtime identifier for a specific instance of a window.
    -   **Singleton**: The Instance ID is identical to the Window Key. Only one can exist "Open" at a time.
    -   **Multi-Instance**: Generated unique string (typically a UUID). Multiple instances of the same Window Key can exist simultaneously.

## 4. State & Persistence

### 4.1 Canonical Window State
The following attributes MUST be persisted to maintain user spatial arrangement:

| Attribute | Type | Description |
| :--- | :--- | :--- |
| `x` | number | Horizontal position relative to Viewport origin. |
| `y` | number | Vertical position relative to Viewport origin. |
| `width` | number | Width in pixels. |
| `height` | number | Height in pixels. |
| `minimized` | boolean | Whether the window is collapsed to its header/icon. |
| `zOrder` | number | Stacking order index. |
| `docked` | enum/null | Snap-state (e.g., 'left', 'right', 'maximized'). |

### 4.2 Non-Persisted State
The following are strictly runtime-only and MUST NOT be persisted:
-   Velocity / Momentum vectors.
-   Transient drag state.
-   Animation progress.
-   Content-internal scroll position (unless handled by the content block itself).

## 5. Workspace Context Rules

Window state is scoped to the **Browser Tab** (Workspace Session).

1.  **Scope**: Per browser tab. Opening the app in a new tab starts a fresh workspace session or loads a default layout.
2.  **Storage**: State is stored locally on the device, keyed by a per-tab Workspace Session ID (tabId). The storage backend (e.g., localStorage/indexedDB) is an implementation detail, but state MUST survive page reload for that tabId until GC. It is **NOT** synced to the server or across devices automatically.
3.  **Tab Duplication**:
    -   When a tab is duplicated, the snapshot of the window arrangement is cloned.
    -   Subsequent mutations in either tab fork the state; they are independent sessions.
4.  **Garbage Collection**: Stale workspace states from closed tabs should be pruned on app startup or via LRU (Least Recently Used) policy.

## 6. Physics & Bounds

### 6.1 Uniform Physics
All windows adhere to a single set of physics constants (friction, restitution, mass) defined in the Shell Theme Tokens. Windows do not have individual physics properties.

### 6.2 Viewport Bounds
-   Windows are strictly bounded by the Viewport region (the area between Header and Footer).
-   **Constraint**: A window header must remain graspable. Windows cannot be thrown completely off-screen.
-   **Resize Behavior**: If the browser viewport resizes:
    -   Windows outside the new bounds are "pushed" back in.
    -   Maximized/docked windows adjust to new dimensions.
    -   Floating windows maintain relative position if possible, or clamp to nearest edge.

### 6.3 Snapping
-   Windows support snapping to Viewport edges and other windows.
-   **Persistence**: If a window is snapped/docked, this State (`docked: 'left'`) is persisted. If merely floating near an edge, the exact coordinates are persisted.

## 7. Safety & Governance

### 7.1 Spawning Validation
-   Any action (e.g., `openWindow`) requesting to spawn a window MUST provide a valid `windowKey`.
-   **Fail-Closed**: If the `windowKey` is not registered in the `shell.infra.window_registry` block within the active shell bundle, the request is denied. The system explicitly ignores requests for unknown windows.

### 7.2 Safe Mode
In **Safe Mode**:
-   Window spawning may be restricted to a "Core Set" of diagnostic windows.
-   Physics may be restricted (windows become static) to aid accessibility or debugging during instability.

## 8. Related Specifications

-   **[ButtonActionModel](core.ux.shell.ButtonActionModel.md)**: Defines the 'openWindow' action used to spawn these entities.
-   **[Shell Taxonomy](core.ux.shell.md)**: Defines the Viewport region where windows live.
-   **[SafeMode](core.ux.shell.SafeMode.md)**: Governance for restricting window behavior during errors.
-   **[Project Workspace Experience](../../ux/Project_Workspace_Experience.md)**: High-level UX goals for spatial organization.
