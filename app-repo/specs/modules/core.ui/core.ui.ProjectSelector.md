# Module: core.ui.ProjectSelector

## Module ID
core.ui.ProjectSelector

## 1. Purpose

The `core.ui.ProjectSelector` module defines a **UI control** for choosing the active project.

It is responsible for (once implemented):

- Displaying a list of available projects.
- Allowing the user to select a project.
- Updating global UI state (`UiStateStore`) with the selected `currentProjectId`.

It acts as a thin view/controller for project selection, delegating data access and business rules to other modules.

Today, `ProjectSelector` is **Specced-only**: this spec defines its intended responsibilities and API. There is no implementation under `src/core/ui/**` yet.

## 2. Responsibilities and Non-Responsibilities

### Responsibilities (planned)

- Render a dropdown, list, or other control that shows available projects.
- Indicate the currently active project (if any).
- Call into provided project data sources to:
  - Fetch the list of projects (via higher-level services).
- Update `UiStateStore` (or a provided callback) when the user selects a project.

### Non-Responsibilities

- Does **not** directly call `core.storage` or DB APIs:
  - It should receive project lists via props or high-level services.
- Does **not** decide which projects a user may access; that’s `core.permissions`/`core.auth`.
- Does **not** implement full UX for project creation or deletion; it may surface actions, but the workflows live elsewhere.

## 3. Public API (planned)

> Conceptual API; the implementation in
> `specs/modules/core.ui/core.ui.ProjectSelector.md` and `src/core/ui/ProjectSelector.tsx` (when created)
> must remain compatible with this description.

### Component

Conceptually:

```tsx
interface ProjectSummary {
  id: string;
  name: string;
}

interface ProjectSelectorProps {
  projects: ProjectSummary[];
  currentProjectId: string | null;
  onSelectProject(id: string | null): void;
}

declare function ProjectSelector(props: ProjectSelectorProps): JSX.Element;
```

Behavior:

- Renders a UI control showing `projects` and highlighting the one with `id === currentProjectId`.
- When the user selects a project:
  - Calls `onSelectProject` with the chosen id (or `null` to clear selection).
- In an AppShell integration, `onSelectProject` would typically:
  - Call into `UiStateStore.setCurrentProject(id)`.

The exact UI control (dropdown, list, etc.) is an implementation detail but should be simple and accessible.

## 4. Internal Model and Invariants (planned)

### Invariants

- All rendered projects must come from the `projects` prop.
- `currentProjectId` must either be `null` or match one of the project IDs in the list (if it doesn’t, the selector should still behave gracefully).
- The component must not throw on empty project lists; it should render a sensible empty state.

### Integration with other modules

- `ProjectSelector` does not know about storage or auth directly:
  - It expects higher-level orchestrators (e.g., AppShell) to pass in the correct `projects` list and callbacks.
- It may be wrapped or composed with other components to integrate project creation or filters.

## 5. Planned vs Implemented

### Current status

- **Lifecycle status**: `Specced`
  - Spec exists; there is no implementation under `src/core/ui/**`.
  - No tests exist yet for this module.

### Planned implementation steps

- Add `src/core/ui/ProjectSelector.tsx` (or similar) implementing the React component.
- Integrate with `UiStateStore` in AppShell by wiring `onSelectProject` to store updates.
- Add tests to validate selection behavior and empty-state handling.

## 6. Dependencies (planned)

### Upstream dependencies

`core.ui.ProjectSelector` is expected to depend on:

- React.
- UI primitives (e.g., design system components) once chosen.

It MUST NOT depend directly on:

- `core.storage`, `core.db`, or other persistence modules.
- `feature.*` modules.

### Downstream dependents

Expected consumers:

- `core.ui.AppShell` and any other UI that needs a project picker.

## 7. Error Model (planned)

- The component should not throw for normal props (even empty lists).
- Invalid props (e.g., malformed project entries) should fail gracefully (e.g., skip invalid entries).

Any additional error-handling behavior must be documented as the implementation matures.

## 8. Testing Strategy (planned)

Tests SHOULD cover:

- Rendering with an empty project list (showing an empty state).
- Rendering with multiple projects and marking the current project.
- Emitting `onSelectProject` with correct IDs when the user selects a project.
- Behavior when `currentProjectId` is not in the list (e.g., still rendering the list without crashing).

Tests can live under `tests/core/projectSelector.test.tsx` or similar.

## 9. CI / Governance Integration

Once implemented:

- Changes to the props or behavior of `ProjectSelector` MUST:
  - Update this spec.
  - Update implementation and tests.
  - Keep the `core.ui` block spec and inventory entry in sync.
  - Ensure `npm run spec:check` remains green from the monorepo root.

Until then, this module remains **future work** described only in specs.
