# Block: core.ui

## Block ID
core.ui

## 1. Purpose

The `core.ui` block defines the **application shell and core UI infrastructure**. It provides:

- A global UI state store for the workspace (`UiStateStore`).
- An application‑level error surface (`ErrorSurface`) and React error boundary (`ErrorBoundary`).
- Planned primitives for routing and layout (AppShell, NavigationRouter, ProjectSelector).

The goal of this block is to give feature modules a **stable frame** (layout, navigation, error handling, and shared UI state) without embedding feature‑specific logic directly into the core UI layer.

## 2. Scope and Non‑Scope

### In scope

`core.ui` is responsible for:

- Representing **global UI state** (active project, active panel, sidebar open/closed).
- Providing a **centralized error surface** for the app (logging + diagnostics hooks).
- Providing a **React error boundary** for top‑level app rendering.
- Defining the **planned contract** for:
  - Top‑level routes (login, project list, project workspace).
  - App shell layout and project selection UI.

### Out of scope

`core.ui` is **not** responsible for:

- Business logic or domain workflows (delegated to feature modules and core services).
- Authentication or authorization rules (delegated to `core.auth` and `core.permissions`).
- Data persistence (delegated to `core.storage` and `core.db`).
- Feature‑specific UI panels (map, sketch, comments, files, etc.). These live in `feature.*` or other higher‑level modules and **must not** be implemented directly in `core.ui`.

## 3. Block Decomposition

`core.ui` is decomposed into the following modules:

| Module ID                     | Responsibility                                                | Status      |
|------------------------------|---------------------------------------------------------------|-------------|
| `core.ui.UiStateStore`       | Global UI state (active project, active panel, sidebar)      | Implemented |
| `core.ui.ErrorSurface`       | Central error reporting surface + diagnostics hook           | Implemented |
| `core.ui.ErrorBoundary`      | React error boundary wrapping the app                        | Implemented |
| `core.ui.AppShell`           | Top‑level app layout, header/sidebar, routing integration    | Specced     |
| `core.ui.NavigationRouter`   | Top‑level navigation between login/projects/workspace        | Specced     |
| `core.ui.ProjectSelector`    | UI element for selecting the active project                  | Specced     |

Block‑level lifecycle:

- **Block status**: `Implemented`
  - Some modules are implemented and tested (`UiStateStore`, `ErrorSurface`, `ErrorBoundary`).
  - Layout and routing primitives (`AppShell`, `NavigationRouter`, `ProjectSelector`) are **Specced‑only** and will be implemented in future iterations.

Any new modules introduced under `core.ui` MUST be added to this table and to the inventory.

## 4. Responsibilities per Module (High‑Level)

### `core.ui.UiStateStore` (Implemented)

Owns the **canonical UI state** for the workspace:

- `currentProjectId: string | null`
- `activePanel: "default" | "sketch" | "map" | "files" | "settings"` (current workspace panel)
- `isSidebarOpen: boolean`

Provides:

- `getState()` and `subscribe(listener)` for reactive updates.
- Mutators such as `setCurrentProject`, `setActivePanel`, `setSidebarOpen`, `toggleSidebar`.

This module does not do IO or routing; it is an in‑memory state container.

### `core.ui.ErrorSurface` (Implemented)

Provides a **central error reporting surface** for the application:

- Accepts errors from `ErrorBoundary` and other core components.
- Logs them via `core.foundation.Logger`.
- Emits structured diagnostics via `core.foundation.DiagnosticsHub` (or equivalent).

Key invariant: error reporting must be **fail‑safe** — it must never crash the app or throw.

### `core.ui.ErrorBoundary` (Implemented)

A React error boundary that:

- Wraps the top‑level app (or large subtrees).
- Catches render‑time errors and forwards them to `ErrorSurface`.
- Renders a fallback UI (simple but robust) when errors occur.

Key invariant: **UI error reporting must never crash the app**; the boundary must be resilient even when the underlying UI is broken.

### `core.ui.AppShell` (Specced)

Planned responsibilities:

- Provide a top‑level layout:
  - Header, sidebar, main content area.
  - Container for feature panels.
- Integrate with `UiStateStore` to reflect:
  - Active project, active panel, sidebar state.
- Integrate with `NavigationRouter` (once implemented) to:
  - Represent the current route (login, projects list, project workspace).
  - Change routes in response to user actions.

At present, `AppShell` is **design‑only**; there is no implementation in `src/core/ui/**`.

### `core.ui.NavigationRouter` (Specced)

Planned responsibilities:

- Own the **top‑level routing contract** for the app, including (at minimum):
  - `/login`
  - `/projects`
  - `/projects/:projectId`
- Expose a simple navigation API (conceptually):
  - `navigateToLogin()`
  - `navigateToProjectsList()`
  - `navigateToProjectWorkspace(projectId)`
  - `getCurrentRoute()`

Panel/layout state **is not** currently encoded in the route; it lives in `UiStateStore`. Encoding panel state into URLs is treated as a **future enhancement**, and any such change must be reflected in this block spec and in the `core.ui.NavigationRouter` module spec.

### `core.ui.ProjectSelector` (Specced)

Planned responsibilities:

- Provide a UI control to pick the active project from a list.
- Call into:
  - `core.storage` (via higher‑level services) to discover projects.
  - `UiStateStore` to change `currentProjectId`.
- Remain UI‑only: it should not contain business logic beyond selection behavior.

There is currently no implementation for this module; it is a future UI primitive.

## 5. Dependencies

### Allowed dependencies for `core.ui`

`core.ui` may depend on:

- `core.foundation`  
  - Logging (`Logger`), diagnostics (`DiagnosticsHub`), Result/utility types.
- `core.auth` (conceptually)  
  - For authentication state, if needed by AppShell/login screens (once implemented).
- `core.permissions` (conceptually)  
  - For permission‑aware UI affordances (enable/disable controls), again likely via higher‑level services.
- `core.storage` (conceptually)  
  - For project listing/selection flows, via orchestrator services used by `ProjectSelector` and AppShell.

Implementation today actually only uses:

- `core.foundation` from within `ErrorSurface`.
- React itself (via `ErrorBoundary`).

### Prohibited dependencies

`core.ui` MUST NOT depend on:

- `feature.*` modules directly (map, sketch, comments, files, etc.).
- DB or storage implementation details (`core.db`, low‑level `core.storage` internals).
- Backends, networking (`core.network`), or other infrastructural concerns that belong in deeper layers.

Feature panels and workflows SHOULD be wired into the shell via higher‑level orchestration or configuration, not by hardcoded imports in `core.ui` modules.

Any temporary exceptions (e.g., direct feature imports in AppShell) MUST be treated as explicit, documented technical debt in the relevant specs and the inventory notes.

## 6. Invariants and Behavioral Guarantees

- **Error handling invariants**
  - `ErrorBoundary` and `ErrorSurface` must never throw; they must always fail‑safe.
  - All unhandled React render errors at the app shell level must be captured by `ErrorBoundary` and surfaced via `ErrorSurface`.

- **UI state invariants**
  - `UiStateStore` is the single source of truth for:
    - `currentProjectId`
    - `activePanel`
    - `isSidebarOpen`
  - Subscribers must be robust: a misbehaving UI listener must not corrupt global state or crash the store.

- **Routing invariants (planned)**
  - Once implemented, `NavigationRouter` will own the top‑level route contract.
  - Changes to base route structure (`/login`, `/projects`, `/projects/:projectId`) must go through specs first.

- **Layering invariants**
  - `core.ui` must remain a shell; it must not embed business logic from feature modules.

## 7. Performance Considerations

Today, `core.ui` is lightweight:

- `UiStateStore` is an in‑memory store with simple subscribers.
- `ErrorBoundary` and `ErrorSurface` add minimal overhead under normal conditions.

When `AppShell` and `NavigationRouter` are implemented, we will:

- Define performance expectations for:
  - Initial app shell render.
  - Navigation between login → project list → project workspace.
- Capture those budgets under `specs/perf/performance_budget.json` and link them back to this block.

Any changes that significantly increase the cost of:

- Rendering the initial shell, or
- Switching between top‑level screens

MUST be accompanied by a review of the relevant performance budgets.

## 8. Testing Strategy

The `core.ui` block relies on:

- Unit tests for:
  - `UiStateStore` (subscription behavior, initial state, mutations).
  - `ErrorBoundary` (ensuring it catches errors and renders fallback without crashing).
  - `ErrorSurface` (ensuring it logs/emits diagnostics without throwing).
- Integration tests (future) for:
  - AppShell + NavigationRouter once they are implemented.
  - Project selection flows via ProjectSelector and UiStateStore.

As this block grows, tests MUST be added or updated to ensure:

- Error handling remains fail‑safe.
- UI state transitions are predictable.
- Routes (once implemented) behave according to this spec.

## 9. CI and Governance Integration

`core.ui` participates in the spec‑first governance system as follows:

- Any change to:
  - The global UI state model (`UiState`, `ActivePanel`).
  - Error handling behavior at the app level.
  - The top‑level route contract.
  - Block‑level dependencies (e.g., introducing a new dependency on feature modules).
- MUST:

  1. Update this block spec first.
  2. Update the relevant module spec(s) under `specs/modules/core.ui/`.
  3. Update implementations under `src/core/ui/**`.
  4. Update or add tests under `tests/core/**`.
  5. Keep `Blocks_Modules_Inventory.md` and `specs/inventory/inventory.json` in sync with the actual lifecycle status of each module.
  6. Ensure `npm run spec:check` passes from the monorepo root (`E:\Fole`).

AI agents and humans MUST follow `_AI_MASTER_RULES.md` and `Spec_Workflow_Guide.md` when evolving `core.ui`, keeping **specs, inventory, code, and tests** aligned.
