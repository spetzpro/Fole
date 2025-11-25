export type ActivePanel = "default" | "sketch" | "map" | "files" | "settings";

export interface UiState {
  currentProjectId: string | null;
  activePanel: ActivePanel;
  isSidebarOpen: boolean;
}

export type UiStateListener = (state: UiState) => void;

export interface UiStateStore {
  getState(): UiState;
  subscribe(listener: UiStateListener): () => void;

  setCurrentProject(projectId: string | null): void;
  setActivePanel(panel: ActivePanel): void;
  setSidebarOpen(isOpen: boolean): void;
  toggleSidebar(): void;
}

let globalStore: UiStateStore | null = null;

function createUiStateStore(): UiStateStore {
  let state: UiState = {
    currentProjectId: null,
    activePanel: "default",
    isSidebarOpen: true,
  };

  const listeners = new Set<UiStateListener>();

  function notify(): void {
    for (const listener of listeners) {
      try {
        listener(state);
      } catch {
        // UI listeners must not break global UI state.
      }
    }
  }

  return {
    getState(): UiState {
      return state;
    },

    subscribe(listener: UiStateListener): () => void {
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },

    setCurrentProject(projectId: string | null): void {
      if (state.currentProjectId === projectId) return;
      state = { ...state, currentProjectId: projectId };
      notify();
    },

    setActivePanel(panel: ActivePanel): void {
      if (state.activePanel === panel) return;
      state = { ...state, activePanel: panel };
      notify();
    },

    setSidebarOpen(isOpen: boolean): void {
      if (state.isSidebarOpen === isOpen) return;
      state = { ...state, isSidebarOpen: isOpen };
      notify();
    },

    toggleSidebar(): void {
      state = { ...state, isSidebarOpen: !state.isSidebarOpen };
      notify();
    },
  };
}

export function getUiStateStore(): UiStateStore {
  if (!globalStore) {
    globalStore = createUiStateStore();
  }
  return globalStore;
}
