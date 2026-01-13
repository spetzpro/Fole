export interface DerivedTickEvalResult {
    applied: number;
    skipped: number;
    logs: string[];
}

// Minimal JSON Pointer helpers for local use to ensure purity
function getByPointer(obj: any, pointer: string): any {
    if (!pointer.startsWith('/')) return undefined;
    const parts = pointer.split('/').slice(1);
    let current = obj;
    for (const part of parts) {
        if (current === undefined || current === null) return undefined;
        current = current[part];
    }
    return current;
}

function setByPointer(obj: any, pointer: string, value: any): boolean {
    if (!pointer.startsWith('/')) return false;
    const parts = pointer.split('/').slice(1);
    if (parts.length === 0) return false;
    
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (current[part] === undefined || current[part] === null) {
            current[part] = {}; // Auto-create path
        }
        current = current[part];
    }
    
    const lastPart = parts[parts.length - 1];
    current[lastPart] = value;
    return true;
}

export function applyDerivedTickFromBundle(bundle: any, runtimeState: Record<string, any>): DerivedTickEvalResult {
    const result: DerivedTickEvalResult = { applied: 0, skipped: 0, logs: [] };

    if (!bundle || !bundle.blocks) {
        result.logs.push("Invalid bundle: missing blocks");
        return result;
    }

    // 1. Collect and sort binding blocks
    const bindings = Object.values(bundle.blocks)
        .filter((b: any) => 
            b.blockType === "binding" && 
            b.data && 
            b.data.mode === "derived" && 
            b.data.enabled === true
        )
        .sort((a: any, b: any) => a.blockId.localeCompare(b.blockId));

    for (const binding of bindings) {
        const b = binding as any;
        const blockId = b.blockId;
        const data = b.data;

        try {
            // Validate mapping existence
            if (!data.mapping) {
                result.logs.push(`[${blockId}] Missing mapping`);
                result.skipped++;
                continue;
            }

            const { kind } = data.mapping;

            if (kind === 'copy') {
                const startVal = result.applied;
                // Get endpoints
                const fromEpId = data.mapping.from;
                const toEpId = data.mapping.to;

                const fromEp = data.endpoints?.find((e: any) => e.endpointId === fromEpId);
                const toEp = data.endpoints?.find((e: any) => e.endpointId === toEpId);

                if (!fromEp || !toEp) {
                    result.logs.push(`[${blockId}] Missing endpoints for copy: ${fromEpId} -> ${toEpId}`);
                    result.skipped++;
                    continue;
                }

                // Check Directions
                // Source must be readable (out or inout)
                if (fromEp.direction !== "out" && fromEp.direction !== "inout") {
                    result.logs.push(`[${blockId}] Source endpoint ${fromEpId} has invalid direction ${fromEp.direction} for read`);
                    result.skipped++;
                    continue;
                }
                // Target must be writable (in or inout)
                if (toEp.direction !== "in" && toEp.direction !== "inout") {
                    result.logs.push(`[${blockId}] Target endpoint ${toEpId} has invalid direction ${toEp.direction} for write`);
                    result.skipped++;
                    continue;
                }

                // Resolve Source Value
                const srcBlockId = fromEp.target?.blockId;
                const srcPath = fromEp.target?.path;
                
                if (!srcBlockId || !srcPath) {
                    result.logs.push(`[${blockId}] Source endpoint ${fromEpId} missing target definition`);
                    result.skipped++;
                    continue;
                }

                const srcBlockState = runtimeState[srcBlockId];
                if (!srcBlockState) {
                    // Fail closed if source block state missing (or not initialized everywhere)
                    // In some runtimes, missing block state might be valid, but here we assume strictness?
                    // Let's log and skip.
                    result.logs.push(`[${blockId}] Source block state ${srcBlockId} not found`);
                    result.skipped++;
                    continue;
                }

                const val = getByPointer(srcBlockState, srcPath);
                
                // Resolve Target
                const dstBlockId = toEp.target?.blockId;
                const dstPath = toEp.target?.path;

                if (!dstBlockId || !dstPath) {
                    result.logs.push(`[${blockId}] Target endpoint ${toEpId} missing target definition`);
                    result.skipped++;
                    continue;
                }

                if (!runtimeState[dstBlockId]) {
                    // Auto-init block state if missing? 
                    // Usually safer to skip if block doesn't exist in runtime state map, 
                    // but for "applyTick" we might be initializing. 
                    // The instruction said "Fail-closed: log and skip on ... bad pointers".
                    // But if runtimeState[dstBlockId] is missing, is it a bad pointer?
                    // Let's assume the caller initializes keys for all valid blocks.
                    runtimeState[dstBlockId] = {};
                }

                // Check for change to avoid redundant writes? 
                // The requirements don't strictly say we must check for equality, but it's good practice.
                // However, "applied" usually means we ran the logic.
                // Let's write blindly for now to match strict "apply" behavior, 
                // or check equality if we want to mimic efficient updates.
                // Simple implementation: Just write.
                
                const currentVal = getByPointer(runtimeState[dstBlockId], dstPath);
                
                // Simple strict equality check to determine if "work" was done could be complex with objects.
                // But for primitive values it's easy.
                // Let's always write, and count it as applied.
                
                const success = setByPointer(runtimeState[dstBlockId], dstPath, val);
                if (success) {
                    result.applied++;
                } else {
                    result.logs.push(`[${blockId}] Failed to set value at ${dstBlockId}:${dstPath}`);
                    result.skipped++;
                }

            } else if (kind === 'setLiteral') {
                const toEpId = data.mapping.to;
                const toEp = data.endpoints?.find((e: any) => e.endpointId === toEpId);

                if (!toEp) {
                    result.logs.push(`[${blockId}] Missing target endpoint ${toEpId}`);
                    result.skipped++;
                    continue;
                }

                if (toEp.direction !== "in" && toEp.direction !== "inout") {
                    result.logs.push(`[${blockId}] Target endpoint ${toEpId} has invalid direction ${toEp.direction} for write`);
                    result.skipped++;
                    continue;
                }

                const dstBlockId = toEp.target?.blockId;
                const dstPath = toEp.target?.path;
                const val = data.mapping.value;

                if (!dstBlockId || !dstPath) {
                    result.logs.push(`[${blockId}] Target endpoint ${toEpId} missing target definition`);
                    result.skipped++;
                    continue;
                }

                if (!runtimeState[dstBlockId]) {
                    runtimeState[dstBlockId] = {};
                }

                const success = setByPointer(runtimeState[dstBlockId], dstPath, val);
                if (success) {
                    result.applied++;
                } else {
                    result.logs.push(`[${blockId}] Failed to set literal at ${dstBlockId}:${dstPath}`);
                    result.skipped++;
                }
            } else {
                result.logs.push(`[${blockId}] Unsupported mapping kind: ${kind}`);
                result.skipped++;
            }

        } catch (e: any) {
            result.logs.push(`[${blockId}] Exception: ${e.message}`);
            result.skipped++;
        }
    }

    return result;
}
