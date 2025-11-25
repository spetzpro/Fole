import type { CurrentUser } from "./CurrentUserTypes";

export type AuthStatus = "unauthenticated" | "authenticating" | "authenticated" | "error";

export interface AuthState {
  status: AuthStatus;
  user: CurrentUser | null;
  lastError?: string;
}

export type AuthStateListener = (state: AuthState) => void;

export interface AuthStateStore {
  getState(): AuthState;
  subscribe(listener: AuthStateListener): () => void;
  setState(next: AuthState): void;
}

let globalAuthStateStore: AuthStateStore | undefined;

export function getAuthStateStore(): AuthStateStore {
  if (!globalAuthStateStore) {
    globalAuthStateStore = createDefaultAuthStateStore();
  }
  return globalAuthStateStore;
}

export function setAuthStateStore(store: AuthStateStore): void {
  globalAuthStateStore = store;
}

export function createDefaultAuthStateStore(): AuthStateStore {
  let state: AuthState = { status: "unauthenticated", user: null };
  const listeners = new Set<AuthStateListener>();

  return {
    getState(): AuthState {
      return state;
    },
    subscribe(listener: AuthStateListener): () => void {
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },
    setState(next: AuthState): void {
      state = next;
      for (const listener of listeners) {
        listener(state);
      }
    },
  };
}
