# AI Guidance: UI Node Graph Spec (v2)

File: `specs/core/_AI_UI_NODE_GRAPH_SPEC.md`
Version: SPEC_V1.0
Scope: Defines the "Config-Driven Application Builder" vision, where the UI is a resolved graph of nodes, slots, and bindings, authored by sysadmins.

**Interlink Note:**  
This spec focuses on the v2 Node DSL (Nodes, Slots, Templates, Conditions). For broader UI system principles, layouts, and windowing architecture, see:  
- [`_AI_UI_SYSTEM_SPEC.md`](./_AI_UI_SYSTEM_SPEC.md)

---

## 1. Vision & Maturity

**Goal:** Transform the hardcoded shell into a fully data-driven runtime where the UI is a function of `(Configuration + UserPermissions + Context)`.
This enables sysadmins to drag-and-drop construct the application layout, dashboards, and forms without engineering intervention.

### Maturity & Compatibility:
- **v1 (Stable/Legacy):** The current runtime shell, `core.ui` window manager, and basic config bindings are implemented and working.
- **v2 (Target/Planned):** The generalized "Node Graph" DSL described here is the *target state*. Some v2 concepts (like `ui.node.*` types) may be implemented incrementally.
- **Data Persistence:** Both v1 and v2 stores are backed by JSON blocks. The transition does NOT require a database engine swap, merely a change in how the Configuration Service interprets the JSON payload (Static Config -> Resolved Graph).

### Transition Strategy:
- New built-in widgets (PDF Viewer, etc.) will be written as v2-compatible nodes.
- The "Sysadmin Builder" itself will be transparently hosted as just another widget within the graph.

---

## 2. Block Types and Roles

The UI graph consists of specific *Node Types*, each with a distinct role.

### 2.1 UI Nodes (`ui.node.*`)
Visual elements rendered by the client runtime.
- **`ui.node.window`**: A floating or docked container with a title bar, size constraints, and lifecycle.
- **`ui.node.container` / `ui.node.group`**: Layout primitives (HBox, VBox, Grid, Card).
- **`ui.node.text`**: Static text, headers, or bound labels.
- **`ui.node.button`**: The universal interactable triggers actions.
- **`ui.node.input`**: Form overrides (text, number, date).
- **`ui.node.dropdown`**: Selection controls (static options or bound to named queries).
- **`ui.node.table`**: Data grids bound to query results.
- **`ui.node.image`**: Static or URL-bound images.
- **`ui.node.icon`**: Symbol references (Lucide/Material).

### 2.2 Built-in Widget Nodes
Specialized, heavy client-side features wrapped as config nodes.
- **`ui.node.pdfViewer`**: Renders PDF assets.
- **`ui.node.imageEditor`**: The core raster manipulation surface.
- **`ui.node.surfaceViewport`**: The infinite canvas map viewer.

### 2.3 Action Definitions (`action.*`)
Server-authoritative capabilities defined in the backend. The UI references them by ID.
- Example: `action.map.createLayer`, `action.auth.logout`.
- The node configuration only specifies *parameters* for the action; logic is never in the client config.

### 2.4 Templates (`template.*`)
Reusable value configurations.
- **Role:** Allows defining a "Standard Button" or "Inventory Table" config once.
- **Inheritance (`inheritFrom`):** Value-level inheritance only (DeepMerge strategy).
- **No Logical Inheritance:** Templates cannot define new behavior, only default property values.

### 2.5 Themes (`ui.theme.*`)
- **`ui.theme`**: Defines color palettes, spacing, and typography tokens.
- **`ui.themeProfile.sysadminBuilder`**: Built-in overrides specifically for the Sysadmin Builder mode to distinguish it from the runtime app.

### 2.6 Named Queries (`query.named.*`)
- **Security Primitives:** No raw SQL allowed in node config.
- **Usage:** Nodes like tables or dropdowns reference `query.named.getActiveUsers`.
- **Parameters:** Nodes pass context (e.g., `projectId`) to the query engine.

---

## 3. Slots & Placements

The application shell exposes well-known *Slots* where nodes can be injected.

### 3.1 Global Slots
- **`app.header.left`** / **`app.header.right`**: Top navigation usage.
- **`app.menu.main`**: The primary slide-out or dropdown navigation.
- **`app.footer`**: Status bar usage.
- **`app.overlay`**: Modal/Dialog injection point.

### 3.2 Contextual Slots
- **`window.toolbar`**: Standard action area within a window.
- **`table.row.actions`**: Operations valid for a specific row context.

### 3.3 Universal Button Principle
There is no separate `MenuButton` vs `HeaderButton` type.
- A **`ui.node.button`** behaves differently based on its **Slot Placement**.
- In `app.menu.main`, it renders as a navigation link.
- In `window.toolbar`, it renders as an icon button.

---

## 4. Universal Node Fields

Every node in the graph supports these base properties:

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique identifier in the graph. |
| `type` | `string` | The distinct node type (e.g., `ui.node.button`). |
| `helpText` | `string` | Tooltip or assistive text for the end-user. |
| `requiredPermission`| `string` | **Server-checked** role requirement to view this node. |
| `visibleWhen` | `Condition` | Client-side visibility toggle. |
| `enabledWhen` | `Condition` | Client-side interactivity toggle. |

---

## 5. Conditions Model

Logic is declarative and restricted to ensure safety and performance.

### 5.1 Operators
- **Boolean:** `AND`, `OR`, `NOT`.
- **Equality:** `EQUALS`, `NOT_EQUALS`, `IN`, `NOT_IN`.
- **Existence:** `IS_EMPTY`, `IS_NOT_EMPTY`.
- **String:** `STARTS_WITH`, `CONTAINS`.
- **Regex:** Allowed **only** with explicit bounds (max length/complexity) pre-validated by the governance engine.

### 5.2 Data Integration
- **Context Binding:** Conditions check values against the `BindingContext` (active record, global store).
- **Query Results:** Conditions can check the results of a named query (e.g., `query.named.canEditProject(id)`).
- **Security Note:** `visibleWhen` / `enabledWhen` are UX conveniences. **True security** is enforced by `requiredPermission` (structure) and Backend API checks (data).

---

## 6. The Builder Boundary

The "Sysadmin Builder" is the tool used to edit this graph.

1. **Self-Hosting:** The Builder is itself a widget (`ui.node.sysadminBuilder`).
2. **Implementation:** It has hardcoded structure but uses `ui.themeProfile.sysadminBuilder` for visual distinction (e.g., "Blueprint Mode").
3. **Safety Fallback:** If a sysadmin breaks the config so badly the app won't load, the specialized **Safe Mode** (hardcoded entry point) allows access to the Builder to rollback changes.

---

## 7. Performance Expectations

### 7.1 Backend Compilation
- The server resolves the graph (merges templates, checks permissions, prunes invisible nodes) **once** per session/change.
- The client receives a "Resolved Graph", minimizing client-side computation.

### 7.2 Virtualization
- Nodes that render lists (tables, repeaters) MUST implement virtualization.
- The runtime enforces limits on the number of DOM elements rendered.

### 7.3 Guardrails
- **Max Nodes:** The validation engine enforces a cap on total graph size.
- **Max Depth:** Tree depth is limited to prevent stack overflows/render thrashing.
- **Binding Limits:** Max listeners per node are capped.

---

## 8. Summary of Intent

This spec moves the repository from "Hardcoded React App" to "Runtime Interpreter".
All future UI feature work should be framed as either:
1. Creating a new **Node Type** (Capabilities).
2. Authoring a **Configuration** (Assembly).
