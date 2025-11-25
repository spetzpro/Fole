# Block: core.ui

## 1. Purpose / Responsibility

Provide the core application shell and navigation:

- Layout (top bar, side bar, content panes)
- Routing between main screens
- Global UI state (current project, auth status)
- Slots/mount points for feature panels (sketch, map, files, etc.)

### Not Responsible For

- Implementing feature-specific UIs (sketch editor, map viewer)
- Authentication logic itself (delegated to `core.auth`)
- Permission rules (delegated to `core.permissions`)

---

## 2. High-Level Summary

`core.ui` is the “frame” in which all tools live.

It ensures that:

- The user can pick a project and see its workspace
- Global state like “current project” and “is logged in” is available
- Panels can plug into well-defined areas of the UI without re-inventing layout and navigation

---

## 3. Modules in This Block

| Module             | Responsibility                                          | Status  |
|--------------------|---------------------------------------------------------|---------|
| AppShell           | Top-level layout component                              | planned |
| NavigationRouter   | Route between main screens (projects, workspace, etc.)  | planned |
| ProjectSelector    | UI + logic for selecting the active project             | planned |
| UiStateStore       | Global UI state (current project, shell state)          | planned |
| ErrorBoundary      | Catch and render app-level errors                       | planned |

---

## 4. Data Model

In-memory / frontend state:

- `UiState`:
  - `currentProjectId | null`
  - `isSidebarOpen`
  - `activePanel` (sketch, map, files, settings, etc.)
- `Route`:
  - `path`
  - `params`

No direct persistent storage here; it consumes from `core.auth` and `core.storage`.

---

## 5. Interactions

**Called By**

- All feature UIs that need mounting points in the shell

**Depends On**

- `core.auth` (to know whether user is logged in)
- `core.permissions` (to show/hide controls)
- `core.storage` (to list/open projects)
- `core.foundation` (logging, config)

Example API:

```tsx
import { AppShell } from '@/core/ui/AppShell';
import { useUiState } from '@/core/ui/UiStateStore';
```

The shell will render different layouts based on auth + current project state.

---

## 6. Events & Side Effects

- URL/route changes
- Visual feedback (toasts, dialogs)
- Navigation events like:
  - `project_opened`
  - `panel_changed`

---

## 7. External Dependencies

- UI framework (React)
- Routing library (React Router or custom)
- Design system / component library (TBD / project-level)

---

## 8. MVP Scope

- Simple `AppShell` with:
  - Header + sidebar + main content
- Minimal routing:
  - `/login`
  - `/projects`
  - `/projects/:projectId`
- `ProjectSelector` integrated with `core.storage` project list
- `UiStateStore` managing:
  - `currentProjectId`
  - `activePanel` (MVP: just “default workspace”)
- Basic error boundary to avoid white-screens
