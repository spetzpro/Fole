# Module: core.ui.AppShell

## Module ID
core.ui.AppShell

## 1. Purpose

The `core.ui.AppShell` module defines the **top-level application layout** and frame.

It is responsible for (once implemented):

- Rendering the main application chrome:
  - Header, sidebar, and main content area.
- Hosting the primary workspace surface where feature panels are rendered.
- Wiring global UI state (`UiStateStore`) into visible UI (active project, active panel, sidebar state).
- Integrating with the top-level navigation model (`NavigationRouter`) to reflect and change the current route.

Today, `AppShell` is **Specced-only**: this spec describes the planned responsibilities and API. There is no implementation yet under `src/core/ui/**`.

## 2. Responsibilities and Non-Responsibilities

### Responsibilities (planned)

- Render a durable frame around feature content:
  - A header area (e.g., app title, user info).
  - A sidebar (e.g., navigation, project selection).
  - A main workspace area where feature modules plug in.
- Read from `UiStateStore` and respond to:
  - `currentProjectId`
  - `activePanel`
  - `isSidebarOpen`
- Expose UI controls that trigger changes to:
  - Sidebar open/closed state.
  - Active panel selection (e.g., map, sketch, files).
  - Active project selection (delegated to `ProjectSelector`).
- Interact with `NavigationRouter` to:
  - Navigate between login → projects list → project workspace.
  - Reflect route changes (e.g., when a project workspace is opened).

### Non-Responsibilities

- Does **not** implement feature-specific content; it only hosts feature panels in a routed slot.
- Does **not** perform data fetching or persistence:
  - It may call higher-level services (e.g., project listing) provided by other modules, but should not contain that logic directly.
- Does **not** own authentication logic (`core.auth`) or permissions rules (`core.permissions`);
  - It can **consume** such state via dedicated services or props.

## 3. Public API (planned)

> This is a conceptual API. When `AppShell` is implemented, its actual signature must
> remain compatible with this description.

### Component

- Default export: `AppShell` React component.

Conceptually:

```tsx
interface AppShellProps {
  // Optional dependency injection hooks for testing / composition.
  uiStateStore?: UiStateStore;
  navigationRouter?: NavigationRouter;
  projectSelectorSlot?: React.ReactNode;
  children?: React.ReactNode; // optional extra content
}

declare function AppShell(props: AppShellProps): JSX.Element;
```

Behavior:

- Reads from the effective `UiStateStore` (either injected or default `getUiStateStore()`).
- Uses the effective `NavigationRouter` (once implemented) to:
  - Determine which top-level screen to render.
  - Navigate based on user actions.
- Uses `projectSelectorSlot` (or a default `ProjectSelector` component) to present a project picker when appropriate.

Exact prop shapes may be refined during implementation, but the overall pattern (React component + optional DI hooks) should remain.

## 4. Internal Model and Invariants (planned)

### Layout invariants

- The shell always renders a **structural frame** even when there is no active project:
  - Header is present.
  - Sidebar may be present (conditionally open/closed).
  - Main content area shows either:
    - Login screen
    - Projects list
    - Empty state
    - Project workspace (panels)
- When `isSidebarOpen` is false, the shell must still allow re-opening or otherwise accessing navigation controls.

### State wiring invariants

- `currentProjectId` from `UiStateStore` determines whether we are in a project workspace vs a more global view.
- `activePanel` from `UiStateStore` determines which feature panel is considered “active” in the workspace area.
- `isSidebarOpen` from `UiStateStore` controls whether the sidebar is visible.

Any change to how these values are interpreted MUST be reflected here and in `UiStateStore`’s spec.

## 5. Planned vs Implemented

### Current status

- **Lifecycle status**: `Specced`
  - This module is described in specs but has no implementation in `src/core/ui/**`.
  - There are no tests for AppShell yet.
  - All layout and routing behavior is future work.

### Planned implementation steps

- Introduce `src/core/ui/AppShell.tsx` (or similar) implementing this spec.
- Add tests to verify:
  - Layout structure.
  - Basic wiring to `UiStateStore` (active panel, sidebar toggling).
  - Integration with `NavigationRouter` once it exists.

## 6. Dependencies (planned)

### Upstream dependencies

`core.ui.AppShell` is expected to depend on:

- `core.ui.UiStateStore` (for global UI state).
- `core.ui.NavigationRouter` (for routing, once implemented).
- `core.ui.ProjectSelector` (or a slot where it can be mounted).
- React.

It MAY interact via props/services with:

- `core.auth` (for login/user state).
- `core.permissions` (for permission-aware UI affordances).

It MUST NOT depend directly on:

- `feature.*` modules (map, sketch, etc.) — feature panels should be provided via configuration or composition, not hardcoded imports.
- Low-level storage or DB modules.

### Downstream dependents

Expected consumers:

- The main UI entry point (root application render).
- Integration tests for the overall UI shell.

## 7. Error Model (planned)

`AppShell` itself does not provide a special error model; it is intended to be wrapped by `core.ui.ErrorBoundary` at an appropriate level.

- It should handle expected UI states gracefully (no project selected, missing data, etc.).
- It should not throw for normal user actions; errors must be surfaced via the ErrorBoundary and ErrorSurface.

## 8. Testing Strategy (planned)

Once implemented, tests SHOULD cover:

- Layout snapshots or structure:
  - Header, sidebar, content areas rendered as expected.
- State wiring:
  - Changing `UiStateStore` state (active panel, sidebar, project) results in expected UI updates.
- Routing integration:
  - When `NavigationRouter` changes route, AppShell renders appropriate screens.

Tests for AppShell can live under `tests/core/appShell.test.tsx` or a similar file. They must be kept in sync with this spec.

## 9. CI / Governance Integration

When implementation begins:

- This spec must be refined with the actual prop types and interactions.
- Implementation MUST adhere to the responsibilities and invariants described above.
- Tests MUST be added and wired into the test suite.
- The `core.ui` block spec and inventory entry MUST be updated to reflect the module’s lifecycle status (transition from `Specced` to `Implemented`).
- `npm run spec:check` must remain green from the monorepo root.

AI agents and humans MUST treat this module as **future work** until an implementation and tests exist.
