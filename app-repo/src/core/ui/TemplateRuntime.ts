
export interface TemplateSessionModel {
    entrySlug: string;
    targetBlockId: string;
    manifest: any;          // from bundle.bundle.manifest (or equivalent)
    targetBlock: any;       // the block envelope for targetBlockId
    bindings: any[];        // All binding blocks in the bundle
    overlays: any[];        // All overlay blocks in the bundle
    windowRegistry: any;    // shell.infra.window_registry block
    routingInfra: any;      // shell.infra.routing block
    themeTokensInfra: any;  // shell.infra.theme_tokens block
    routeResolution: any;   // The resolution response
}

export type TemplateRuntimeResult =
    | { ok: true; model: TemplateSessionModel }
    | { ok: false; error: string; details?: any };

export function assembleTemplateSession(bundleContainer: any, entrySlug: string, resolveResponse: any): TemplateRuntimeResult {
    // 1. Fail-closed: Check resolve response
    if (resolveResponse.allowed !== true || resolveResponse.status !== 200) {
        return { ok: false, error: "Route not allowed", details: { resolveResponse } };
    }

    // 2. Validate targetBlockId exists in resolve response
    const targetBlockId = resolveResponse.targetBlockId;
    if (!targetBlockId) {
        return { ok: false, error: "Target block ID missing from resolution" };
    }

    // 3. Extract bundle machinery
    // The server typically returns { bundle: { manifest: ..., blocks: ... }, metadata: ... }
    const actualBundle = bundleContainer.bundle;
    if (!actualBundle) {
        return { ok: false, error: "Invalid bundle container structure" };
    }

    const blocks = actualBundle.blocks || {};
    const targetBlock = blocks[targetBlockId];

    // 4. Validate block existence
    if (!targetBlock) {
        return { 
            ok: false, 
            error: `Target block '${targetBlockId}' not found in bundle`,
            details: { targetBlockId, availableBlocks: Object.keys(blocks) }
        };
    }

    // 5. Collect Bindings, Overlays, and Window Registry
    const bindings: any[] = [];
    const overlays: any[] = [];
    let windowRegistry: any = null;
    let routingInfra: any = null;
    let themeTokensInfra: any = null;
    
    for (const [key, block] of Object.entries(blocks)) {
        const b = block as any;
        if (b.blockType === "binding") {
            bindings.push(b);
        } else if (b.blockType && b.blockType.startsWith("shell.overlay.")) {
            overlays.push(b);
        } else if (b.blockType === "shell.infra.window_registry") {
            windowRegistry = b;
        } else if (b.blockType === "shell.infra.routing") {
            routingInfra = b;
        } else if (b.blockType === "shell.infra.theme_tokens") {
            themeTokensInfra = b;
        }
    }

    if (!windowRegistry) {
        return { ok: false, error: "Window registry missing" };
    }
    if (!routingInfra) {
        return { ok: false, error: "Routing infra missing" };
    }
    if (!themeTokensInfra) {
        return { ok: false, error: "Theme tokens infra missing" };
    }

    // Sort for determinism
    bindings.sort((a, b) => a.blockId.localeCompare(b.blockId));
    overlays.sort((a, b) => a.blockId.localeCompare(b.blockId));

    // 6. Assemble and return model
    return {
        ok: true,
        model: {
            entrySlug,
            targetBlockId,
            manifest: actualBundle.manifest,
            targetBlock,
            bindings,
            overlays,
            windowRegistry,
            routingInfra,
            themeTokensInfra,
            routeResolution: resolveResponse
        }
    };
}
