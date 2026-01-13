import { WindowSystemPersistence, CanonicalWindowState } from './WindowSystemRuntime';
import { WorkspacePersistence } from './WorkspacePersistence';

export class WindowWorkspaceBridge implements WindowSystemPersistence {
    constructor(private workspace: WorkspacePersistence) {}

    async load(tabId: string): Promise<CanonicalWindowState[] | null> {
        // Delegate to workspace persistence
        // The workspace persistence returns any[], which we cast to CanonicalWindowState[]
        const wins = await this.workspace.loadWindows(tabId);
        return wins as CanonicalWindowState[] | null;
    }

    async save(tabId: string, windows: CanonicalWindowState[]): Promise<void> {
        // Delegate to workspace persistence
        await this.workspace.saveWindows(tabId, windows);
    }
}
