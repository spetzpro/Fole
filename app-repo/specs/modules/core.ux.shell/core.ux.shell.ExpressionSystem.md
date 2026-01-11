# Module: core.ux.shell.ExpressionSystem

## Module ID
core.ux.shell.ExpressionSystem

## 1. Purpose and Scope

The **Expression System** provides a safe, declarative, and portable way to define logic within the Core UX Shell. It replaces opaque scripts or hardcoded flags with a strictly-typed Abstract Syntax Tree (AST) representing boolean or value-based logic.

### 1.1 Scope
-   **Declarative Logic**: Used for UI visibility (`isVisible`), interactivity (`isEnabled`), access control, and dynamic text resolution.
-   **Security**: No arbitrary code execution (No `eval`, no function calls).
-   **Fail-Closed**: Invalid, strictly-typed, or unresolved expressions default to `false`.
-   **Portability**: Expressions are JSON-serializable and can be evaluated on both Server (validation) and Client (runtime).

### 1.2 Out of Scope
-   **Scripting**: Complex procedural logic or side effects are forbidden.
-   **Data Mutation**: Expressions are read-only; they cannot modify state.

## 2. Expression AST Model

The Expression System uses a recursive JSON AST. Every node MUST have a `kind` property.

### 2.1 Primitives (Literals)
Represents static values.
-   **Kind**: `literal`
-   **Props**:
    -   `value`: boolean | number | string | null

### 2.2 References (Variables)
Lookup dynamic values from the runtime context.
-   **Kind**: `ref`
-   **Props**:
    -   `refType`:
        -   `permission`: Check if current user has permission (value: bool).
        -   `role`: Check for RBAC role (value: bool).
        -   `uiState`: Lookup transient UI flags (e.g., `isSidebarOpen`).
        -   `surfaceState`: Lookup databound states (e.g., `selectedItemCount`).
    -   `key`: string (The identifier to look up).

### 2.3 Logical Operators
Combine boolean results.
-   **Kind**: `not`
    -   **Props**: `expr` (AST Node)
-   **Kind**: `and` | `or`
    -   **Props**: `exprs` (Array of AST Nodes).
    -   **Behavior**: Short-circuit evaluation.

### 2.4 Comparison Operators
Compare two values.
-   **Kind**: `cmp`
-   **Props**:
    -   `op`: `==` | `!=` | `<` | `<=` | `>` | `>=`
    -   `left`: AST Node
    -   `right`: AST Node
-   **Typing**: Operands must be comparable types (number vs number, string vs string). Mismatched types result in `false` (Fail-Closed).

### 2.5 Set Operators
Check membership.
-   **Kind**: `in`
-   **Props**:
    -   `item`: AST Node (scalar)
    -   `set`: Array of AST Nodes (or a ref resolving to an array).

### 2.6 Existence Operators
Check definition.
-   **Kind**: `exists`
-   **Props**:
    -   `expr`: AST Node (usually a `ref`).
    -   **Result**: True if `ref` resolves to a non-null, non-undefined value.

## 3. Evaluation Semantics

### 3.1 Fail-Closed Principle
The system is defensively designed.
1.  **Unknown References**: If a `ref` key is not found in the context, it evaluates to `null` (or `false` effectively in boolean context).
2.  **Type Mismatches**: Comparing `1 > "apple"` evaluates to `false`. It does not throw.
3.  **Recursion Limits**: Evaluation depth is capped (default: 20 levels). Exceeding this returns `false`.
4.  **Cost Limits**: Total node count is capped (default: 100 nodes per expression) to prevent DoS.

### 3.2 Evaluation Context
Expressions are stateless. They require a context object provided by the runtime (Shell, Permission System, or Feature Block) containing:
-   `permissions`: Set<string>
-   `roles`: Set<string>
-   `ui`: Record<string, any>
-   `data`: Record<string, any>

## 4. Related Specifications

-   **[PermissionModel](../core.permissions/core.permissions.PermissionModel.md)**: Defines the keys available for `refType: permission`.
-   **[ButtonActionModel](core.ux.shell.ButtonActionModel.md)**: Uses expressions for `disabledWhen` or `hiddenWhen`.
-   **[RoutingResolution](core.ux.shell.RoutingResolution.md)**: Uses expressions for route guards.
-   **[SafeMode](core.ux.shell.SafeMode.md)**: Expressions operate normally in Safe Mode, but complex checks may fail-closed if data sources are partial.
