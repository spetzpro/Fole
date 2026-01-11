# Module: core.ux.shell.ButtonActionModel

## Module ID
core.ux.shell.ButtonActionModel

## 1. Purpose

This module defines the declarative action model for interactive buttons within the **Core UX Shell**. It treats buttons as first-class entities that decouple the *visual representation* of a control from its *behavioral logic*.

The goal is to provide a safe, typed, and inspectable system where buttons can trigger navigation, commands, or window management without executing arbitrary scripts. This model supports complex interaction patterns (like long-press and drag-and-drop) while enforcing strict governance and confirmation protocols for destructive actions.

## 2. Scope

This specification governs:
-   The structure of the Action Descriptor used by `shell.control.button.*` blocks.
-   The typed definition of supported interactions (click, long-press, context-menu).
-   The resolution and execution logic for actions.
-   The schema for confirmation dialogs attached to actions.
-   Integration with the Permissions system and Developer Modes.
-   **Out of Scope**: The specific visual styling of buttons (covered in `core.ux.shell.ThemeTokens`).

## 3. Core Concepts

### 3.1 Button Block Types
Buttons are defined as blocks (e.g., `shell.control.button.standard`, `shell.control.button.icon`). Instead of `onClick` handlers, they expose an `interactions` map in their data schema.

### 3.2 Action Descriptor
An Action Descriptor is a purely declarative JSON object describing *what* should happen, not *how*. It contains no executable code.

```typescript
interface ActionDescriptor {
  kind: ActionKind;          // e.g., 'navigate', 'command'
  params: object; // Validated per kind (schema-enforced); unknown fields rejected
  destructive?: boolean;     // If true, triggers confirmation wrapper
  confirmation?: ConfirmationConfig;
  permissions?: string[];    // Required permissions to execute
}
```

### 3.3 Confirmation Model
Any action marked `destructive: true` MUST include a valid `confirmation` config. If checking fails, the action is blocked (fail-closed).
-   **Required Fields**: `title`, `message`, `confirmLabel`, `cancelLabel`.
-   **Severity**: Determines the visual style of the dialog (e.g., `warning` (yellow) vs `danger` (red)).

## 4. Interaction Types

Buttons support multiple distinct interaction triggers. The shell listens for these events and resolves them to actions.

| Interaction | Description |
| :--- | :--- |
| **click** | Primary activation (left-click or tap). |
| **long-press** | Sustained press (>500ms). Often used for advanced options or edit mode. |
| **context-menu** | Right-click or secondary tap. |
| **drag** | Initiates a drag operation. Requires a defined payload info. sequence: `dragStart` -> `dragMove` -> `dragDrop`. |

## 5. Action Resolution

When an interaction occurs, the Shell resolves the action using the following deterministic logic:

1.  **Existence Check**: Does the button config have an entry for this interaction type? 
    -   *No* -> **No-op**.
2.  **Enabled Check**: Is the button or action explicitly disabled?
    -   *Yes* -> **No-op**.
3.  **Permission Check**: Does the user have all `permissions` listed in the descriptor?
    -   *No* -> **Deny** (log security event, show toast if feedback enabled).
4.  **Destructive Check**: Is `destructive: true`?
    -   *Yes* -> **Suspend execution**, show Confirmation Dialog.
    -   *If Confirmed* -> Proceed.
    -   *If Cancelled* -> **Stop**.
5.  **Execution**: Dispatch the action to the appropriate handler (Router, CommandService, WindowManager).

**Fail-Closed Rule**: If an action descriptor is malformed (missing params, unknown kind), the system MUST swallow the event and log an error. It MUST NOT attempt to guess the intent.

## 6. Supported Action Kinds

The following `ActionKind` values are supported by the core kernel:

| Kind | Description | Required Params |
| :--- | :--- | :--- |
| `navigate` | Changes the primary shell route. | `path` (string) OR `routeId` (string), `params?` (object) |
| `openWindow` | Opens a floating or docked tool window. | `windowKey` (string), `mode` ('singleton'\|'multi') |
| `toggleOverlay` | Generic overlay toggle (menus, sidebars). | `overlayId` (string) |
| `command` | Executes a registered system command. | `commandId` (string), `args?` (array) |
| `externalLink` | Opens a URL in a new browser tab/window. | `url` (string) |
| `noop` | explicitly does nothing (useful for placeholders). | None |

## 7. Governance & Permissions

### 7.1 Permission Hooks
Every action execution is gated by the `core.permissions.PermissionGuards` module.
-   Format: `"module.resource.action"` (e.g., `core.auth.user.delete`).
-   If multiple permissions are listed, ALL must be satisfied (AND logic).

### 7.2 Developer Mode
-   **Safe Mode**: Destructive actions may be globally disabled or require elevated confirmation.
-   **Developer/Advanced Mode**: Does NOT bypass action permissions by default. Testing destructive or restricted actions requires the user to actually hold those roles, or the use of specific `debug` overrides defined in `ModesAdvancedDeveloper`.

## 8. Related Specifications

-   **[ModesAdvancedDeveloper](core.ux.shell.ModesAdvancedDeveloper.md)**: Rules for debugging actions and overriding constraints.
-   **[RoutingResolution](core.ux.shell.RoutingResolution.md)**: Handling of the `navigate` action kind.
-   **[SafeMode](core.ux.shell.SafeMode.md)**: Interaction with destructive actions and warning surfaces.
-   **[PermissionGuards](../../core/core.permissions/core.permissions.PermissionGuards.md)**: The authoritative permission checking logic.
