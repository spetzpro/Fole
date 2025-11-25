# Module: core.ui.UiStateStore

## 1. Purpose
Global UI state store for current project, active panel, and sidebar state.

## 2. Types
~~~ts
export type ActivePanel = "default" | "sketch" | "map" | "files" | "settings";

export interface UiState {
  currentProjectId: string | null;
  activePanel: ActivePanel;
  isSidebarOpen: boolean;
}
~~~

## 3. Public API
~~~ts
export type UiStateListener = (state: UiState) => void;

export interface UiStateStore {
  getState(): UiState;
  subscribe(listener: UiStateListener): () => void;

  setCurrentProject(projectId: string | null): void;
  setActivePanel(panel: ActivePanel): void;
  setSidebarOpen(isOpen: boolean): void;
  toggleSidebar(): void;
}

export function getUiStateStore(): UiStateStore;
~~~
