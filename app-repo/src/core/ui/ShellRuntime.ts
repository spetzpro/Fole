import { createSessionRuntime, SessionRuntime } from './SessionRuntime';
import { createOverlayRuntime, OverlayRuntime, OverlayState } from './OverlayRuntime';
import { createWindowSystemRuntime, WindowSystemRuntime, CanonicalWindowState } from './WindowSystemRuntime';
import { createWorkspacePersistence, WorkspacePersistence, WorkspaceStorageAdapter } from './WorkspacePersistence';
import { WindowWorkspaceBridge } from './WindowWorkspaceBridge';
import { buildActionIndex, ActionDescriptor } from './ActionIndex';
import { ClientRuntime } from './ClientRuntime';

export interface RenderPlan {
    entrySlug: string;
    targetBlockId: string;
    actions: ActionDescriptor[];
    windows: CanonicalWindowState[];
    overlays: OverlayState[];
}

export interface ShellRuntime {
    getPlan(): RenderPlan;
    dispatchAction(req: { sourceBlockId: string; actionName: string; payload?: any; permissions?: string[]; roles?: string[] }): Promise<any>;
    applyDerivedTick(): Promise<any>;
    openWindow(windowKey: string): { ok: boolean; error?: string };
    toggleOverlay(overlayId: string): { ok: boolean; isOpen?: boolean; error?: string };
}

export async function createShellRuntime(args: {
    client: ClientRuntime;
    entrySlug: string;
    tabId: string;
    viewport: { width: number; height: number };
    workspaceAdapter: WorkspaceStorageAdapter;
}): Promise<ShellRuntime> {
    
    // 1. Create Session
    const session = await createSessionRuntime(args.client, args.entrySlug); 
    
    // 2. Window Persistence
    const workspace = createWorkspacePersistence(args.workspaceAdapter);
    await workspace.createSession(args.tabId); 
    
    const bridge = new WindowWorkspaceBridge(workspace);

    // 3. Window Runtime
    const windowRegistryEnvelope = session.model.windowRegistry;
    const windowRuntime = createWindowSystemRuntime({
        tabId: args.tabId,
        viewport: args.viewport,
        windowRegistryBlockEnvelope: windowRegistryEnvelope,
        persistence: bridge
    });
    // Load persisted windows
    await windowRuntime.loadFromPersistence();

    // 4. Overlay Runtime
    // OverlayRuntime factory takes { overlays: any[] }
    const overlayRuntime = createOverlayRuntime({
        overlays: session.model.overlays || []
    });

    // 5. Action Index
    const actions = buildActionIndex(session.model);

    return {
        getPlan(): RenderPlan {
            return {
                entrySlug: args.entrySlug,
                targetBlockId: session.model.targetBlockId,
                actions: actions,
                windows: windowRuntime.list(),
                overlays: overlayRuntime.list()
            };
        },

        async dispatchAction(req) {
            return session.dispatchAction(req);
        },

        async applyDerivedTick() {
            return session.applyDerivedTick();
        },

        openWindow(windowKey: string) {
            return windowRuntime.openWindow(windowKey);
        },

        toggleOverlay(overlayId: string) {
            return overlayRuntime.toggle(overlayId);
        }
    };
}
