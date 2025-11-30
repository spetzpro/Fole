import type { AuthTokens, AuthUserInfo } from "./AuthApiClient";

export interface PersistedSession {
  tokens: AuthTokens;
  user: AuthUserInfo;
  persistedAt?: string;
}

export interface SessionStore {
  load(): Promise<PersistedSession | null>;
  save(session: PersistedSession): Promise<void>;
  clear(): Promise<void>;
}

let globalSessionStore: SessionStore | undefined;

export function setSessionStore(store: SessionStore): void {
  globalSessionStore = store;
}

export function getSessionStore(): SessionStore {
  if (!globalSessionStore) {
    globalSessionStore = createInMemorySessionStore();
  }
  return globalSessionStore;
}

export function createInMemorySessionStore(): SessionStore {
  let persisted: PersistedSession | null = null;

  return {
    async load(): Promise<PersistedSession | null> {
      return persisted;
    },
    async save(session: PersistedSession): Promise<void> {
      persisted = session;
    },
    async clear(): Promise<void> {
      persisted = null;
    },
  };
}
