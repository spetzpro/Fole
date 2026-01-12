# Module: core.ux.shell.BindingSystem
Version: SPEC_V1.0
Last-Updated: 2026-01-12

## Module ID
core.ux.shell.BindingSystem

## 1. Purpose & Scope

The **Binding System** provides a declarative mechanism to connect the state and behavior of disparate blocks within the Shell Configuration. Unlike hardcoded event listeners or script-based glue code, Bindings are distinct, first-class entities (`blockType: binding`) that define relationships between other blocks (Endpoints).

### 1.1 Key Objectives
-   **Decoupling**: Blocks (e.g., a Button and an Overlay) need not know about each other. The Binding Block mediates their interaction.
-   **Inspectability**: Bindings are not hidden in code. They are inspectable assets. Any block participating in a binding displays a "Bindings: N" indicator in the developer/admin tools.
-   **Declarative Logic**: All effects are defined via static configuration, preventing "spaghetti script" scenarios.

## 2. Data Model

A Binding is defined as a dedicated Block in the configuration bundle.

### 2.1 BindingBlock Envelope
```json
{
  "blockId": "bind_nav_open",
  "blockType": "binding",
  "schemaVersion": "1.0.0",
  "data": { ... }
}
```

### 2.2 Binding Data Structure
The `data` payload controls the behavior.

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `mode` | Enum | Yes | `derived` or `triggered`. See Section 3. |
| `endpoints` | Array | Yes | List of participating endpoints (Min: 2). |
| `mapping` | Object | Yes | Definition of the data transformation or event flow. |
| `enabled` | Boolean | Yes | Master switch for the binding. |
| `accessPolicy` | Object | No | Gating rules (Roles, Anonymous, Expressions). |

### 2.3 Endpoint Definition
An `Endpoint` represents a specific path on a specific block.

| Field | Type | Description |
| :--- | :--- | :--- |
| `endpointId` | String | Local alias for the endpoint (e.g., "source", "dest"). |
| `target` | Object | `{ "blockId": "btn_verify", "path": "/state/disabled" }` |
| `direction` | Enum | `in` (Source), `out` (Sink), `inout` (Two-way). |

## 3. Binding Modes

### 3.1 Derived Mode (`mode: "derived"`)
-   **Semantics**: Continuous state synchronization. "Calculated from".
-   **Behavior**: When a **source** endpoint changes, the binding evaluates the `mapping` and updates the **target** endpoint(s).
-   **Use Case**: Disabling a "Save" button when a Form's "isValid" state is false.
-   **Constraint**: Must be acyclic.

### 3.2 Triggered Mode (`mode: "triggered"`)
-   **Semantics**: Event-driven action. "When X happens, do Y".
-   **Behavior**: When a **source** endpoint emits a signal (e.g., button click, storage write), the binding executes the `mapping` logic to mutate the **target**.
-   **Use Case**: Opening a specific Overlay when a Header button is clicked.

## 4. Governance Rules

### 4.1 Validation (Fail-Closed)
-   **Invalid Endpoints**: If any endpoint references a missing `blockId` or invalid JSON pointer `path`, the *entire* binding is disabled (A1 Error).
-   **Cycle Detection**: Derived bindings must not form a closed loop (A -> B -> C -> A). Detected cycles result in an A1 validation error.
-   **Unused Bindings**: A binding with enabled endpoints but no active observers puts negligible load on the system.

### 4.2 Security & Access Policy
Bindings respect the `accessPolicy` field using the [ExpressionSystem](core.ux.shell.ExpressionSystem.md).
-   If `accessPolicy` evaluates to `false`:
    -   **Derived**: Usage stops; target retains last known value or reverts to default (impl specific).
    -   **Triggered**: Events are dropped silently.
-   **Fail-Closed**: If `expr` errors or is invalid, access is denied.

## 5. UI & Introspection

The Binding System mandates transparency:

1.  **Bi-Directional Links**: Viewing a Block (e.g., in a DevTool) MUST list all Bindings attached to it.
2.  **"Bindings: N" Chip**: UI representations of blocks in admin interfaces should show a count of active bindings.
3.  **Graph View**: (Future) Inspectable DAG of data flow.

## 6. Cross-References

-   [core.ux.shell.ExpressionSystem](core.ux.shell.ExpressionSystem.md) - For `mapping` logic and `accessPolicy`.
-   [core.ux.shell.ShellConfigValidation](core.ux.shell.ShellConfigValidation.md) - Enforces A1 rules (cycles, broken links).
-   [core.ux.shell.ButtonActionModel](core.ux.shell.ButtonActionModel.md) - Source of 'click' triggers.
-   [core.ux.shell.SafeMode](core.ux.shell.SafeMode.md) - Bindings may be disabled globally in Safe Mode.
