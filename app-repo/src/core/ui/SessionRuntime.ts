import { ClientRuntime } from './ClientRuntime';
import { assembleTemplateSession, TemplateSessionModel } from './TemplateRuntime';
import { applyDerivedTickFromBundle } from './DerivedTickEvaluator';

export type DerivedTickResult =
    | { ok: true; didWork: boolean; result?: any; reason?: "not-implemented" }
    | { ok: false; error: string };

export interface SessionRuntime {
    entrySlug: string;
    model: TemplateSessionModel;
    dispatchAction(req: { sourceBlockId: string; actionName: string; payload?: any; permissions?: string[]; roles?: string[] }): Promise<any>;
    applyDerivedTick(): Promise<DerivedTickResult>;
    __debugGetRuntimeState(): Record<string, any>; // TEST ONLY
}

export async function createSessionRuntime(client: ClientRuntime, entrySlug: string): Promise<SessionRuntime> {
    // 1. Load active bundle
    const bundleContainer = await client.loadActiveBundle();
    if (!bundleContainer || !bundleContainer.bundle) {
        throw new Error("Failed to load active bundle");
    }

    // 2. Resolve route
    const resolveResponse = await client.resolveRoute(entrySlug);
    
    // 3. Assemble session
    const assembled = assembleTemplateSession(bundleContainer, entrySlug, resolveResponse);
    
    if (!assembled.ok) {
        throw new Error(`Session assembly failed: ${assembled.error}`);
    }

    // 4. Initialize local runtime state (for Prod Mode)
    const sessionRuntimeState: Record<string, any> = {};
    if (bundleContainer.bundle.blocks) {
        for (const blockId of Object.keys(bundleContainer.bundle.blocks)) {
            const block = bundleContainer.bundle.blocks[blockId];
            if (block.blockType !== 'binding') {
                 sessionRuntimeState[blockId] = { state: { ...((block.data && block.data.state) || {}) } };
            }
        }
    }

    return {
        entrySlug,
        model: assembled.model,
        dispatchAction: async (req) => {
            return client.dispatchDebugAction(req);
        },
        applyDerivedTick: async () => {
            if (client.config.devMode === true) {
                try {
                    const r = await client.dispatchDebugDerivedTick();
                    if (r && r.status === 403) {
                         return { ok: false, error: r.error || "Forbidden" };
                    }
                    return { 
                        ok: true, 
                        didWork: (r && typeof r.applied === "number" ? r.applied > 0 : false), 
                        result: r 
                    };
                } catch (e: any) {
                    return { ok: false, error: e.message || "Failed to apply derived tick" };
                }
            } else {
                 // PROD mode: run locally
                 const res = applyDerivedTickFromBundle(bundleContainer.bundle, sessionRuntimeState);
                 return { ok: true, didWork: res.applied > 0, result: res };
            }
        },
        __debugGetRuntimeState: () => sessionRuntimeState
    };
}
