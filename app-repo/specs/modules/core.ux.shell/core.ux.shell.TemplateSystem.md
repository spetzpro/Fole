# Module: core.ux.shell.TemplateSystem
Version: SPEC_V1.0
Last-Updated: 2026-01-12

## Module ID
core.ux.shell.TemplateSystem

## 1. Purpose & Scope

The **Template System** is the comprehensive assembly engine for the Shell. It defines how granular configuration primitives—Surfaces, Tools, DataSources, Windows, and Buttons—are composed into a coherent, task-specific Workspace.

### 1.1 Objectives
- **Composition**: Provides the blueprint for assembling independent blocks into a usable application state.
- **Reference-Based**: Templates do NOT own data; they reference abstract DataSources and Tools, ensuring separation of concerns.
- **Distribution**: Templates are serializable assets that can be shipped with releases, customized server-side, and assigned via logic or routing.

## 2. Core Concepts

### 2.1 Primitives & Relationships

| Concept | Definition | Relationship |
| :--- | :--- | :--- |
| **Template** | The top-level container defining a complete workspace configuration. | Aggregates all other primitives. |
| **Surface** | The primary viewport-rendered context (e.g., Map, Canvas, 3D Scene). | Rendered in the main shell area. |
| **Tool** | A functional unit interacting with a Surface (e.g., "Draw Polygon", "Measure"). | References a Surface; Referenced by Windows/Buttons. |
| **DataSource** | A pointer to a persistent data store or API (e.g., "GeoJSON Layer", "User DB"). | Referenced by Surfaces and Tools. |
| **Window** | A floating or docked panel containing UI controls. | Hosts Buttons and Inputs; References Tools. |
| **Button** | An actionable UI element. | Triggers Tools or Shell commands. |

### 2.2 The Reference Chain
1.  **DataSource** holds the state.
2.  **Surface** visualizes the DataSource.
3.  **Tool** manipulates the Surface or DataSource.
4.  **Button/Window** invokes the Tool.
5.  **Template** defines the existence and wiring of all the above.

## 3. Template Structure

A Template is a structured JSON Block. Templates are referenceable entities in the bundle; routing configuration maps URL slugs to a Template's `blockId`. Templates do not claim URL slugs themselves.

### 3.1 JSON Model (Concept)
```json
{
  "blockId": "tpl_standard_editor",
  "blockType": "template",
  "data": {
    "label": "Standard GIS Editor",
    "enabled": true,
    // Note: Selection is controlled by shell.infra.routing mapping to this blockId
    
    // Composition Lists (References to Block IDs)
    "surfaces": [ "surf_main_map" ],
    "tools": [ "tool_draw", "tool_select" ],
    "dataSources": [ "ds_satellite", "ds_features" ],
    "windows": [ "win_layer_control", "win_attributes" ],
    "buttons": [ "btn_save", "btn_measure" ],
    // Wiring
    "bindings": [ "bind_selection_to_panel" ]
  }
}
```

## 4. Governance Rules

### 4.1 Validation
Templates are validated by [ShellConfigValidation](core.ux.shell.ShellConfigValidation.md).
-   **Integrity**: All referenced block IDs must exist in the bundle.
-   **Structure**: Must adhere to the Template schema.
-   **Permissions**: Inclusion in a template does NOT bypass block-level Access Policies. A user may load a template but see blank windows if they lack specific permissions.

### 4.2 Lifecycle & Modification
-   **Immutable Session**: Changing a Template description on the server does NOT mutate an active user session in real-time. The user must reload or re-enter the workspace to ingest the new structure.
-   **Hiding/Disabling**: Templates can be marked `enabled: false` to be removed from selection logic without deletion.

## 5. Lifecycle

### 5.1 Selection
Templates are selected during the **Bootstrap Phase**:
1.  **RoutingResolution** selects an `entrySlug`.
2.  `shell.infra.routing` routes `entrySlug` to a `targetBlockId` which may be a template `blockId`.
3.  Default template selection is expressed in routing (not inside template).
4.  **Resolution Logic**: See [RoutingResolution](core.ux.shell.RoutingResolution.md).

### 5.2 Initialization
Upon selection:
1.  **Resource Loading**: Shell pre-loads required code chunks for referenced Surfaces and Tools.
2.  **Data Connection**: DataSources initiate connections (websockets, APIs).
3.  **Layout hydration**: Windows are spawned in their default locations (or restored from [WorkspacePersistence](core.ux.shell.WorkspacePersistence.md)).

## 6. Cross-References

-   [core.ux.shell.WindowSystem](core.ux.shell.WindowSystem.md) - Layout and panel management.
-   [core.ux.shell.ButtonActionModel](core.ux.shell.ButtonActionModel.md) - Interaction triggers within the template.
-   [core.ux.shell.BindingSystem](core.ux.shell.BindingSystem.md) - Reactive wiring between template members.
-   [core.ux.shell.RoutingResolution](core.ux.shell.RoutingResolution.md) - How this template gets chosen.
-   [core.ux.shell.WorkspacePersistence](core.ux.shell.WorkspacePersistence.md) - Saving user adjustments to the template defaults.
