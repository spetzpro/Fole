# AI Guidance: UI Node Graph Spec (v2)

File: `specs/core/_AI_UI_NODE_GRAPH_SPEC.md`
Version: SPEC_V1.0
Scope: Defines the "Config-Driven Application Builder" vision, where the UI is a resolved graph of nodes, slots, and bindings, authored by sysadmins.

**Interlink Note:**  
This spec focuses on the v2 Node DSL (Nodes, Slots, Templates, Conditions). For broader UI system principles, layouts, and windowing architecture, see:  
- [`_AI_UI_SYSTEM_SPEC.md`](./_AI_UI_SYSTEM_SPEC.md)
- [`_AI_UI_BINDING_AND_LOGIC_SPEC.md`](./_AI_UI_BINDING_AND_LOGIC_SPEC.md) (Logic & Bindings)

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
- The "Sysadmin Builder" is exposed as a built-in widget node (e.g. `ui.node.sysadminBuilder`) that can be placed in the graph, but its structure/behavior remains code-owned for safety; only visuals are tokenized (theme tokens + optional builder profile), with safe fallback + rollback.

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

## 5. Node Prop Schema Standard (v2)

To enable the Builder to generate property editors automatically and ensure strict validation, every Node Type must provide a **JSON Schema Definition**.

### 5.1 Schema-First Approach
- **Standard:** Node type contracts MUST be defined in **JSON Schema (Draft-7 compatible)**.
- **Location:** Schemas must reside in `app-repo/src/server/schemas/shell/`.
- **Consumption:**
  - The **Validation Engine** uses these schemas to validate config integrity.
  - The **Builder UI** SHOULD consume these schemas to dynamically generate the property editor forms.
- **No Dual Pipelines:** Do NOT introduce an independent "prop schema" format (e.g., custom dictionaries) separate from the JSON Schema.

### 5.2 UI Hints & Editors
Since JSON Schema describes *structure* and not necessarily *UI presentation*, additional context MUST be provided via:
1. **Standard Annotations:** Use `title`, `description`, `default`, `examples`, and `enum` fields.
2. **UI Extension Fields:** Use the `x-ui-editorHint` convention for specific widget selection (e.g., `colorPicker`, `iconPicker`).
3. **Companion uiSchema:** If complex logic is needed (e.g., hiding fields based on others), a separate `uiSchema` object may be served alongside the schema.

### 5.3 Example Schema (JSON Schema Style)

**`ui.node.button` (Partial)**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "label": {
      "type": "string",
      "title": "Button Label",
      "description": "Text displayed on the button",
      "x-ui-editorHint": "textbox"
    },
    "variant": {
      "type": "string",
      "enum": ["primary", "secondary", "ghost"],
      "default": "secondary",
      "description": "Visual style of the button"
    },
    "icon": {
      "type": "string",
      "pattern": "^[a-z-]+$",
      "description": "Lucide icon name",
      "x-ui-editorHint": "iconPicker"
    }
  },
  "required": ["label"]
}
```

> **Note on Drift Prevention:** By using the *actual* validation schema to drive the UI, we ensure the Builder cannot produce configurations that the Server will reject.

### 5.4 Planned Schema Locations (v2)

To organize the expanding catalog of v2 nodes without cluttering the existing v1 shell schemas, the following structure is **planned**:

- **Directory:** `app-repo/src/server/schemas/ui-node/` (Proposed)
- **Format:** One file per node type (e.g., `ui.node.button.schema.json`).
- **Authority:** These files are the Single Source of Truth for:
  - **Server Validation:** AJV-based integrity checks during `preflight` and `activate`.
  - **Builder Generation:** Providing the standard and `x-ui-editorHint` metadata to the editor.
- **Compatibility:** existing v1 `shell` schemas remain stable. The v2 node schemas are additive and designed to be compatible with the v2 runtime interpreter. 

*Note: This layout is provisional and may evolve as the implementation begins.*

---

## 6. Slot Registry (v2)

The Shell relies on a strictly defined **Slot Registry** to validate placements.
Arbitrary placements are forbidden; a node must target a valid `slotId`.

### 6.1 Registry Definition

| Slot ID | Layout / Overflow | Allowed Types (Examples) | Max Items |
| :--- | :--- | :--- | :--- |
| **`app.header.left`** | Row / Wrap | `button`, `text`, `icon`, `group` | 5 |
| **`app.header.right`** | Row / Wrap | `button`, `profile`, `group` | 5 |
| **`app.menu.main`** | Col / Scroll | `button`, `separator`, `group` | 50 |
| **`app.footer`** | Row / Ellipsis | `text`, `progress`, `status` | 3 |
| **`app.overlay`** | Stack / Modal | `window`, `dialog`, `toast` | N/A |
| **`window.toolbar`** | Row / Collapse | `button`, `icon`, `input` (search) | 8 |
| **`window.content`** | Fill / Scroll | *ALL* | N/A |
| **`table.row.actions`** | Row / Collapse | `button`, `icon` | 3 |

### 6.2 Placement Validation
- **Preflight Check:** The Validation Engine rejects configs where nodes target unknown slots or use forbidden types (e.g. putting a `table` in `app.header`).
- **Dev Mode Warning:** If constraints (Max Items) are exceeded, the builder emits a warning but may allow render.

---

## 7. Conditions & Logic Governance

All logic within the Graph (Bindings, Expressions, Conditionals) is governed by the strict safety rules defined in:
- [`_AI_UI_BINDING_AND_LOGIC_SPEC.md`](./_AI_UI_BINDING_AND_LOGIC_SPEC.md)

Refer to that spec for:
- Expression Whitelists
- Regex Bounds
- Binding Source Restrictions

---

## 8. The Builder Boundary

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
- Performance constraints and compilation expectations are defined in [`_AI_PERFORMANCE_AND_SCALING_SPEC.md`](./_AI_PERFORMANCE_AND_SCALING_SPEC.md).

---

## 8. Summary of Intent

This spec moves the repository from "Hardcoded React App" to "Runtime Interpreter".
All future UI feature work should be framed as either:
1. Creating a new **Node Type** (Capabilities).
2. Authoring a **Configuration** (Assembly).
