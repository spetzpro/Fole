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

#### Implemented Mapping Kinds (MVP)
The following mapping kinds are currently implemented and supported by the runtime engine:
-   **Copy**: Direct value transfer. Use `direction: "out"` for source, `direction: "in"` for target.
    -   Schema: `{ "kind": "copy", "from": "<endpointId>", "to": "<endpointId>" | ["..."] }`
-   **SetLiteral**: Writes a constant value to one or more targets. No source endpoint read required.
    -   Schema: `{ "kind": "setLiteral", "to": "<endpointId>" | ["..."], "value": any }` (The `value` property is required; `null` is allowed).

*Note: Additional mapping kinds (e.g., toggle, append, transform) are planned but not yet implemented.*

### 3.2 Triggered Mode (`mode: "triggered"`)
-   **Semantics**: Event-driven action. "When X happens, do Y".
-   **Behavior**: When a **source** endpoint emits a signal (e.g., button click, storage write), the binding executes the `mapping` logic to mutate the **target**.
-   **Use Case**: Opening a specific Overlay when a Header button is clicked.

### 3.3 Triggered Bindings (Detailed Semantics)

Triggered bindings provide the reactive glue for user interactions and system events.

#### 3.3.1 Trigger Sources
Triggers initiate the binding execution.
-   **Micro-Interactions**: Direct user inputs such as `click`, `long-press`, `context-menu` (right click), or `drag-drop` initiation/completion on UI blocks (Buttons, Cards).
-   **Signal Endpoints**: Explicit block paths designated as output signals (e.g., `/events/completed` on a Task Block).
-   **System Events**: (Reserved for future use) Global lifecycle events like `app:resume` or `network:online`.

#### 3.3.2 Execution Contract
Unlike derived bindings, triggered bindings are ephemeral and state-independent.
1.  **Discrete Execution**: The binding runs exactly once per emitted event. It does NOT maintain state or continuous synchronization between events.
2.  **Mapping Actions**: The `mapping` definition dictates the payload transformation.
    -   **Set**: Replace target value with constant or event payload.
    -   **Toggle**: Boolean flip of target path.
    -   **Append**: Push to array target (e.g., logs, lists).
3.  **Access Policy**: Verified precisely at trigger time. References `accessPolicy` on the Binding block. If validation fails (or returns false), the event is dropped silently (Fail-Closed).
#### Implemented Triggered Mappings (MVP)
The following mapping kinds are currently implemented and supported by the runtime engine:
-   **SetLiteral**: Writes a constant value to one or more targets.
    -   Schema: `{ "kind": "setLiteral", "to": "<endpointId>"|["..."], "value": any }`
-   **SetFromPayload**: Writes data from the event payload to target(s).
    -   Schema: `{ "kind": "setFromPayload", "to": "<endpointId>"|["..."], "payloadPath": "..." }` (Optional `payloadPath` extracts a specific property; otherwise entire payload is used).
-   **Structure Constraint**: Triggered mappings MUST include a `trigger` definition: `{ "sourceBlockId": "...", "name": "..." }` matching the event source.
#### 3.3.3 Ordering and Reentrancy
To ensure determinism in a highly interconnected shell:
-   **Execution Order**: If multiple Triggered Bindings listen to the exact same source Endpoint and Event, they execute in **ascending alphanumeric order** of their `blockId`.
-   **Loop Prevention (Runaway Chains)**:
    -   Triggered bindings are excluded from static Cycle Detection (as A->B->A over time is valid state toggling).
    -   **Runtime Check**: The dispatcher maintains a recursion counter per original user interaction. If a chain exceeds `MAX_CASCADE_DEPTH` (default: 32), the execution chain serves a Hard Stop (Error logged, subsequent triggers dropped).

#### 3.3.4 Safe Mode Behavior
Under `Safe Mode` (see [SafeMode Spec](core.ux.shell.SafeMode.md)):
-   Triggered bindings flagged as non-essential may be globally disabled.
-   Diagnostic bindings (tagged in `meta`) remain active to assist recovery.

#### 3.3.5 A1 Validation Rules
While runtime behavior is dynamic, the static configuration is strictly validated (Part of `npm run spec:check`):
1.  **Endpoint Integrity**: All source and target blocks MUST exist in the bundle.
2.  **Path Syntax**: JSON pointers in endpoints MUST be syntactically valid (RFC 6901).
3.  **Structure**: The `mapping` object MUST conform to the known schema (e.g., cannot be null or empty).

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

-   [core.ux.shell.ExpressionSystem](core.ux.shell.ExpressionSystem.md) - For `accessPolicy` gating (and optional conditional sub-expressions inside mapping if introduced later).
-   [core.ux.shell.ShellConfigValidation](core.ux.shell.ShellConfigValidation.md) - Enforces A1 rules (cycles, broken links).
-   [core.ux.shell.ButtonActionModel](core.ux.shell.ButtonActionModel.md) - Source of 'click' triggers.
-   [core.ux.shell.SafeMode](core.ux.shell.SafeMode.md) - Bindings may be disabled globally in Safe Mode.
