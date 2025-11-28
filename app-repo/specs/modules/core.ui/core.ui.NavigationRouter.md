# Module: core.ui.NavigationRouter

## Module ID
core.ui.NavigationRouter

## 1. Purpose

The `core.ui.NavigationRouter` module defines the **top-level navigation contract** for the application.

It is responsible for (once implemented):

- Representing the current top-level route (login, projects list, project workspace).
- Providing a simple programmatic API to navigate between these routes.
- Serving as the canonical mapping between route names and URL patterns.

Today, this module is **Specced-only**: this spec captures the intended contract and responsibilities. There is no implementation in `src/core/ui/**` yet.

## 2. Responsibilities and Non-Responsibilities

### Responsibilities (planned)

- Define a small `RouteName` union and `Route` model for top-level screens.
- Define the canonical URL patterns for core routes, at minimum:
  - `/login`
  - `/projects`
  - `/projects/:projectId`
- Provide methods to:
  - Read the current route.
  - Navigate to login, projects list, or a specific project workspace.
- Abstract over the underlying routing mechanism (e.g., `history`, a router library).

### Non-Responsibilities

- Does **not** encode feature-level routes or panel state; those are handled elsewhere (e.g., UI state and feature modules).
- Does **not** manage authentication or authorization; it may redirect based on higher-level logic, but does not own auth.
- Does **not** manage data fetching; it only controls navigation.

## 3. Public API (planned)

> Conceptual API; the eventual implementation in `src/core/ui/NavigationRouter.ts`
> must remain compatible with this description.

### Types

- `type RouteName = "login" | "projects" | "projectWorkspace"`

- `interface Route {`
  - `name: RouteName`
  - `projectId?: string` // present only when name === "projectWorkspace"
  - `}`

### Router interface

Conceptually:

```ts
interface NavigationRouter {
  getCurrentRoute(): Route;
  navigateToLogin(): void;
  navigateToProjectsList(): void;
  navigateToProjectWorkspace(projectId: string): void;
}

function getNavigationRouter(): NavigationRouter;
```

### URL contract (planned)

- `login` route → `/login`
- `projects` route → `/projects`
- `projectWorkspace` route → `/projects/:projectId`

Exact URL integration (e.g., using `window.history`, a router library, or a framework) is deferred to implementation, but the mapping between `RouteName` and these base patterns should remain stable unless explicitly changed in this spec.

Panel/layout state is **not encoded** in the route at this time; it remains in `UiStateStore`. A future enhancement may extend the URL model.

## 4. Internal Model and Invariants (planned)

### Invariants

- There is exactly one **logical** `NavigationRouter` instance per runtime (singleton style).
- The current route is always one of the `RouteName` values.
- When `name === "projectWorkspace"`, `projectId` must be a non-empty string.

### Integration with URLs

- The router is responsible for keeping some internal route representation in sync with the browser URL.
- Implementation choices (e.g., pushState vs router library) must be hidden behind this API.

Any change to how routes are represented or which URLs they map to MUST update this spec and associated module docs.

## 5. Planned vs Implemented

### Current status

- **Lifecycle status**: `Specced`
  - Module is defined in specs but has no implementation in `src/core/ui/**`.
  - No tests exist for NavigationRouter yet.

### Planned implementation steps

- Add `src/core/ui/NavigationRouter.ts` (or similar) implementing this API.
- Integrate with whatever routing mechanism the frontend stack uses.
- Write tests to ensure:
  - Route transitions behave as expected.
  - URL mapping matches this spec.
  - Edge cases (unknown URLs, missing projectId) are handled safely.

## 6. Dependencies (planned)

### Upstream dependencies

`core.ui.NavigationRouter` is expected to depend on:

- The runtime/platform routing primitives (e.g., `window.location`, `history`, or a router library).

It MUST NOT depend on:

- Feature modules (`feature.*`).
- Storage, DB, or auth modules; those are separate concerns.

### Downstream dependents

Expected consumers:

- `core.ui.AppShell` and other top-level UI components.
- Future integration tests or utilities that need to simulate navigation.

## 7. Error Model (planned)

- Navigation methods (`navigateTo*`) should not throw during normal usage.
- For invalid input (e.g., empty projectId), they should either:
  - Log a warning and no-op, or
  - Route to a safe default (e.g., projects list).

The exact behavior must be documented in this spec once implemented.

## 8. Testing Strategy (planned)

Tests SHOULD cover:

- Mapping route names to URLs and back.
- Navigating between login → projects list → project workspace.
- Handling invalid URLs or projectIds safely.

Tests can be located under `tests/core/navigationRouter.test.ts` or similar. They must be written as soon as an implementation exists.

## 9. CI / Governance Integration

Once implemented:

- Any changes to RouteName, Route structure, or URL mappings MUST:
  - Update this spec first.
  - Update implementation and tests.
  - Keep the `core.ui` block spec and inventory entry in sync.
  - Keep `specs/perf/performance_budget.json` aligned if navigation performance budgets are introduced.

`NavigationRouter` remains **future work** until code and tests exist.
