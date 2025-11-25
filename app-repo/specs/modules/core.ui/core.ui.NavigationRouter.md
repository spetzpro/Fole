# Module: core.ui.NavigationRouter

## 1. Purpose
Manage high-level navigation between core screens:
- Login
- Project List
- Project Workspace

This router does NOT encode panel state or workspace layout in the URL.  
All panel/layout state is handled by UiStateStore and future workspace layout persistence.  
The project workspace route is always:  
`/projects/:projectId`

## 2. Route Names

~~~ts
export type RouteName =
  | "login"
  | "projects"
  | "projectWorkspace";
~~~

## 3. Route Definitions

~~~ts
export interface RouteDefinition {
  name: RouteName;
  path: string;
  params?: Record<string, string>;
}
~~~

## 4. Public API

~~~ts
export interface NavigationRouter {
  navigateToLogin(): void;

  navigateToProjectsList(): void;

  navigateToProjectWorkspace(projectId: string): void;

  getCurrentRoute(): RouteDefinition;
}

/**
 * Returns the global NavigationRouter instance.
 */
export function getNavigationRouter(): NavigationRouter;
~~~

## 5. Behavior (MVP)

- Always navigates using one of the three primary routes.
- Route params are decoded but NOT used to determine panel/layout state.
- Panel/layout state is managed by UiStateStore + workspace layout restoration.
- Refreshing the page keeps the user on the same route (`/projects/:projectId`),
  but the workspace layout is restored separately by the workspace initialization logic.
