
export interface TemplateSessionModel {
    entrySlug: string;
    targetBlockId: string;
    manifest: any;          // from bundle.bundle.manifest (or equivalent)
    targetBlock: any;       // the block envelope for targetBlockId
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

    // 5. Assemble and return model
    return {
        ok: true,
        model: {
            entrySlug,
            targetBlockId,
            manifest: actualBundle.manifest,
            targetBlock
        }
    };
}
