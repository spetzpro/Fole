import { ClientRuntime } from './ClientRuntime';
import { assembleTemplateSession, TemplateSessionModel } from './TemplateRuntime';

export type DerivedTickResult =
    | { ok: true; didWork: boolean; result?: any; reason?: "not-implemented" }
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
            if (client.config.devMode !== true) {
                 return { ok: true, didWork: false, reason: "not-implemented" };
            }
            try {
                const r = await client.dispatchDebugDerivedTick();
                // If the response is a 403 error object (from client guard or server), this might fail or return a structured error
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
        }
    };
}
