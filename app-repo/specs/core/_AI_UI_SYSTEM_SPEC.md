# AI Guidance: UI System

File: `specs/core/_AI_UI_SYSTEM_SPEC.md`  
Scope: How the AI should think about the UI architecture, including routes, windowing, and the relationship between core.ui modules and UX specs.

---

## 1. Goals

The UI system should:

- Feel **calm, minimal, and professional**.
- Support a **workspace-centric** experience (projects and their maps/sketches/files/comments).
- Be **predictable** and **recoverable** (refreshing the page does not “lose” your setup).
- Be structured so that AI agents can reason about:
  - where components live
  - how navigation works
  - how state flows through the app.

This document defines the high-level UI model. Concrete modules live under `specs/modules/core.ui/`, and UX flows live under `specs/ux/`.

### 1.5 Current Implementation Status (MVP)

In the current codebase:

- `core.ui.UiStateStore` is implemented and tested, and is used as the central global UI state store.
- `core.ui.ErrorBoundary` and `core.ui.ErrorSurface` are implemented and tested, and wrap major UI surfaces for error handling.
- `core.ui.AppShell`, `core.ui.NavigationRouter`, and `core.ui.ProjectSelector` are **Specced-only** modules:
  - They have module specs but no implementation yet under `src/core/ui/**`.
  - Route handling and workspace selection flows are still conceptual and must be treated as design targets, not existing runtime behavior.
- There is no concrete routing integration (no router library wired into the app); the routing model in this document describes the desired shape for NavigationRouter and AppShell.

AI agents must treat this document as the **target architecture** for the UI system and combine it with the core.ui block/module specs to understand which pieces exist today (UiStateStore, ErrorBoundary/ErrorSurface) and which are future work (AppShell, NavigationRouter, ProjectSelector, full workspace layout manager).

---

## 2. Global UI Structure

At a high level, the app UI is structured as:

1. **Top-level shell** (`core.ui.AppShell`)
   - Renders global chrome: header, optional footer, layout containers.
   - Hosts the active route (login, project list, project workspace).
2. **Navigation Router** (`core.ui.NavigationRouter`)
   - Controls which main screen is active.
3. **UI State Store** (`core.ui.UiStateStore`)
   - Holds global UI state such as the current project and active panel.
4. **Feature/Workspace Content**
   - Project list, workspace, and future feature UIs.

The app aims to support more advanced windowing and layout patterns over time, but for MVP the focus is on a **project workspace** that can evolve to host multiple panels/tools.

---

## 3. Routing Model

The routing model is intentionally simple and does **not** encode the entire workspace layout in the URL.

### 3.1 Route Names & Paths

The router operates with three primary routes:

- `login`
  - Path: `/login` (or similar)
- `projects`
  - Path: `/projects`
- `projectWorkspace`
  - Path: `/projects/:projectId`

This is implemented **conceptually** in `core.ui.NavigationRouter`:

- `navigateToLogin()`
- `navigateToProjectsList()`
- `navigateToProjectWorkspace(projectId)`
- `getCurrentRoute()`

> **MVP note:** In the current implementation, there is no concrete NavigationRouter class or routing library; this API is Specced but not yet present in `src/core/ui/**`.

### 3.2 What the URL Does *Not* Contain

The URL does **not** encode:

- Which panels are open (map, sketch, files, comments).
- How windows/panels are arranged.
- Zoom/scroll positions or selections.
- Coordinate positions or any sensitive spatial data.

Those details live in UI state and workspace layout, for both safety and flexibility reasons.

### 3.3 Workspace Layout & Restore

When the user:

- refreshes the page
- closes and reopens the browser
- navigates away and returns

The system should **restore** the last known workspace layout for that user + project, if available.

This includes:
- which panels/windows are open
- zoom and scroll positions
- which project-level element is selected
- sidebar state

If no saved layout exists:

- The workspace defaults to a **Map-focused layout** (map as primary context).

The logic for loading/saving workspace layout sits on top of `UiStateStore` and/or a dedicated workspace layout store to be designed later.

> **MVP note:** Persistence of workspace layout across browser refreshes is not yet implemented; current UiStateStore is in-memory only.

---

## 4. Relationship to UX Specs

Detailed UX flows and behaviors are described in `specs/ux/` documents.

### 4.1 Project Workspace UX

- File: `specs/ux/Project_Workspace_Experience.md`

This document defines:

- The 3 main screens (Login, Project List, Project Workspace).
- Layout of the Project Workspace:
  - Header (project name, user, active panel name, actions)
  - Sidebar (navigation between panels)
  - Main Canvas (map, sketch, files, comments)
- Behavior for:
  - Opening a project
  - Switching panels
  - Map/floorplan behavior
  - Sketch behavior
  - Files and comments
  - Admin override visibility
  - Workspace restore behavior

The **UI system spec** (this file) should be read together with UX specs:

- Use UX specs for **what** the user experiences.
- Use UI system + module specs for **how** that experience is structured in code.

---

## 5. Core UI Modules

The core implementation of the UI system is described in:

- `specs/modules/core.ui/core.ui.AppShell.md`
- `specs/modules/core.ui/core.ui.NavigationRouter.md`
- `specs/modules/core.ui/core.ui.UiStateStore.md`
- `specs/modules/core.ui/core.ui.ProjectSelector.md`
- `specs/modules/core.ui/core.ui.ErrorBoundary.md`

### 5.1 AppShell

- Provides the top-level React shell.
- Reads the current route from `NavigationRouter`.
- Renders login, project list, or project workspace accordingly.
- Hosts global providers (state, theme, error boundary, etc.).

> **MVP note:** AppShell is Specced with these responsibilities, but has no implementation in `src/core/ui/**` yet. AI must treat this as target behavior.

### 5.2 NavigationRouter

- Implements the route model described in Section 3.
- Does **not** store panel/layout state.
- Only knows about high-level routes (`login`, `projects`, `projectWorkspace`).

> **MVP note:** NavigationRouter is Specced-only at this time; the app does not yet include a concrete routing implementation.

### 5.3 UiStateStore

- Holds global UI state such as:
  - `currentProjectId`
  - `activePanel` (e.g. `map`, `sketch`, `files`, `comments`)
  - `isSidebarOpen`
- Will later serve as a foundation for persisting and restoring workspace layout.

UiStateStore is implemented and tested; it is the one core.ui module that is Stable enough to rely on in the current codebase.

### 5.4 ProjectSelector

- Implements the Project List UI:
  - listing accessible projects
  - creating projects
  - opening a project into the workspace
- Uses:
  - `core.storage.ProjectRegistry` for project listing/creation
  - `core.permissions` to filter by access level
  - `NavigationRouter` to enter `projectWorkspace`

> **MVP note:** ProjectSelector is Specced-only, with no implementation in `src/core/ui/**` yet.

### 5.5 ErrorBoundary

- Wraps major UI surfaces to catch runtime errors.
- Converts exceptions into user-friendly error views.
- Integrates with logging/diagnostics (e.g. `core.foundation.Logger`, `DiagnosticsHub`).

ErrorBoundary and ErrorSurface are implemented and tested; AI can assume their presence when reasoning about UI error handling.

---

## 6. Windowing & Multi-Panel Future

The long-term goal is to support a **windowed/multi-panel** UI inside the workspace:

- Multiple panels or tools open at once (map + sketch + comments, etc.).
- Resizable, dockable areas for different tools.
- Potential future secondary windows (e.g. measurement inspector, metadata tool).

High-level guidelines:

- The **project workspace** is the primary canvas for windowing.
- There should be a clear separation between:
  - global UI shell (AppShell, nav, auth)
  - workspace layout & windows
- Workspace windows should be driven by:
  - the underlying feature blocks (`feature.map`, `feature.sketch`, etc.)
  - data from storage and permissions

For MVP:

- Treat panels (map, sketch, files, comments) as **main views** switched via sidebar.
- Use the simple `activePanel` model in `UiStateStore`.
- Leave the full window manager as future work.

---

## 7. How AI Agents Should Work with the UI System

When making UI-related changes, AI agents should:

1. Identify the relevant layer:
   - Global shell? → `core.ui.AppShell`
   - Navigation? → `core.ui.NavigationRouter`
   - Global UI state? → `core.ui.UiStateStore`
   - Project list/workspace entry? → `core.ui.ProjectSelector`
   - Error behavior? → `core.ui.ErrorBoundary`
   - Detailed workspace behavior? → `specs/ux/Project_Workspace_Experience.md` + future feature specs.
2. Respect the routing model:
   - Do not introduce new routes that encode workspace layout or internal panel state.
3. Respect layered architecture:
   - `core.ui` should not depend on feature-specific blocks.
4. Keep UX & UI docs in sync:
   - If implementing a new UX behavior, ensure there is a corresponding update in `specs/ux/` if needed.
5. Respect MVP state:
   - Use `UiStateStore` and ErrorBoundary/ErrorSurface where appropriate today.
   - Treat AppShell/NavigationRouter/ProjectSelector as design targets unless you are explicitly implementing them.

---

## 8. Future Work

- Introduce concrete implementations for:
  - `core.ui.AppShell`
  - `core.ui.NavigationRouter`
  - `core.ui.ProjectSelector`
- Introduce dedicated feature blocks for workspace panels:
  - `feature.map`, `feature.sketch`, `feature.files`, `feature.comments`, etc.
- Add UX specs for each major panel:
  - Map interaction design
  - Sketch interaction design
  - File browser UX
  - Comments UX
- Add a dedicated workspace layout spec describing the multi-panel/windowing system once the MVP is complete.
