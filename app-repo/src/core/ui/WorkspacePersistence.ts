export interface WorkspaceSessionRecord {
    tabId: string;
    createdAt: number;
    lastSeenAt: number;
    windows: any[]; // CanonicalWindowState[]
}

export interface WorkspaceStorageAdapter {
    loadAll(): Promise<WorkspaceSessionRecord[]>;
    saveAll(records: WorkspaceSessionRecord[]): Promise<void>;
}

export interface WorkspacePersistence {
    createSession(tabId: string, now?: number): Promise<WorkspaceSessionRecord>;
    touchSession(tabId: string, now?: number): Promise<void>;
    saveWindows(tabId: string, windows: any[], now?: number): Promise<void>;
    loadWindows(tabId: string): Promise<any[] | null>;
    forkSession(fromTabId: string, toTabId: string, now?: number): Promise<WorkspaceSessionRecord | null>;
    pruneStale(maxAgeMs: number, now?: number): Promise<number>;
    listSessions(): Promise<WorkspaceSessionRecord[]>;
}

export function createWorkspacePersistence(adapter: WorkspaceStorageAdapter): WorkspacePersistence {
    
    // Helper to sort per spec: lastSeenAt desc, then tabId asc
    const sortRecords = (records: WorkspaceSessionRecord[]) => {
        return records.sort((a, b) => {
            if (b.lastSeenAt !== a.lastSeenAt) {
                return b.lastSeenAt - a.lastSeenAt;
            }
            return a.tabId.localeCompare(b.tabId);
        });
    };

    return {
        async createSession(tabId: string, now?: number): Promise<WorkspaceSessionRecord> {
            const records = await adapter.loadAll();
            const ts = now || Date.now();
            
            // Check if exists? Spec says "createSession creates record". 
            // Usually we'd want to handle collision, but for now we'll overwrite or return existing if fail-closed isn't strict here.
            // Let's assume overwrite or just return existing reference if we wanted idempotency. 
            // A simple implementation is filtering out old one and adding new one.
            
            const existingIndex = records.findIndex(r => r.tabId === tabId);
            let record: WorkspaceSessionRecord;

            if (existingIndex >= 0) {
                 // Resetting session? Or just returning? 
                 // "createSession creates record with empty windows" implies a fresh start usually.
                 record = {
                     tabId,
                     createdAt: ts,
                     lastSeenAt: ts,
                     windows: []
                 };
                 records[existingIndex] = record;
            } else {
                 record = {
                     tabId,
                     createdAt: ts,
                     lastSeenAt: ts,
                     windows: []
                 };
                 records.push(record);
            }

            await adapter.saveAll(records);
            return record;
        },

        async touchSession(tabId: string, now?: number): Promise<void> {
            const records = await adapter.loadAll();
            const record = records.find(r => r.tabId === tabId);
            if (record) {
                record.lastSeenAt = now || Date.now();
                await adapter.saveAll(records);
            }
            // If fail-closed, do nothing if missing.
        },

        async saveWindows(tabId: string, windows: any[], now?: number): Promise<void> {
            const records = await adapter.loadAll();
            const record = records.find(r => r.tabId === tabId);
            if (record) {
                record.windows = windows;
                record.lastSeenAt = now || Date.now(); // Usually saving updates presence
                await adapter.saveAll(records);
            }
        },

        async loadWindows(tabId: string): Promise<any[] | null> {
            const records = await adapter.loadAll();
            const record = records.find(r => r.tabId === tabId);
            return record ? record.windows : null;
        },

        async forkSession(fromTabId: string, toTabId: string, now?: number): Promise<WorkspaceSessionRecord | null> {
            const records = await adapter.loadAll();
            const source = records.find(r => r.tabId === fromTabId);
            
            if (!source) {
                return null;
            }

            const ts = now || Date.now();
            // Deep clone windows
            const clonedWindows = JSON.parse(JSON.stringify(source.windows));

            const newRecord: WorkspaceSessionRecord = {
                tabId: toTabId,
                createdAt: ts,
                lastSeenAt: ts,
                windows: clonedWindows
            };

            // Remove existing if any (overwrite)
            const existingIndex = records.findIndex(r => r.tabId === toTabId);
            if (existingIndex >= 0) {
                records[existingIndex] = newRecord;
            } else {
                records.push(newRecord);
            }

            await adapter.saveAll(records);
            return newRecord;
        },

        async pruneStale(maxAgeMs: number, now?: number): Promise<number> {
            const records = await adapter.loadAll();
            const ts = now || Date.now();
            const threshold = ts - maxAgeMs;

            const initialCount = records.length;
            const liveRecords = records.filter(r => r.lastSeenAt >= threshold);
            const prunedCount = initialCount - liveRecords.length;

            if (prunedCount > 0) {
                await adapter.saveAll(liveRecords);
            }
            return prunedCount;
        },

        async listSessions(): Promise<WorkspaceSessionRecord[]> {
            const records = await adapter.loadAll();
            return sortRecords([...records]); // Return copy
        }
    };
}
