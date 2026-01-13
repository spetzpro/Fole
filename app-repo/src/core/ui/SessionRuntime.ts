import { ClientRuntime } from './ClientRuntime';
import { assembleTemplateSession, TemplateSessionModel } from './TemplateRuntime';

export type DerivedTickResult =
    | { ok: true; didWork: false; reason: "not-implemented" }
    | { ok: false; error: string };

export interface SessionRuntime {
    entrySlug: string;
    model: TemplateSessionModel;
    dispatchAction(req: { sourceBlockId: string; actionName: string; payload?: any; permissions?: string[]; roles?: string[] }): Promise<any>;
    applyDerivedTick(): Promise<DerivedTickResult>;
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

    return {
        entrySlug,
        model: assembled.model,
        dispatchAction: async (req) => {
            return client.dispatchDebugAction(req);
        },
        applyDerivedTick: async () => {
            // Derived ticks not implemented in headless client yet.
            return { ok: true, didWork: false, reason: "not-implemented" };
        }
    };
}
