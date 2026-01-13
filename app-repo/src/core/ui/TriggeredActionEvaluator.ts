export interface TriggeredEvalResult {
    applied: number;
    skipped: number;
    logs: string[];
}

export interface TriggerEvent {
    sourceBlockId: string;
    sourcePath: string;
    name: string;
    payload?: any;
}

export interface TriggerContext {
    permissions: Set<string>;
    roles: Set<string>;
}

// Minimal JSON Pointer helpers for purity
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
            current[part] = {}; 
        }
        current = current[part];
    }
    
    const lastPart = parts[parts.length - 1];
    current[lastPart] = value;
    return true;
}

export function dispatchTriggeredEventFromBundle(bundle: any, runtimeState: Record<string, any>, evt: TriggerEvent, ctx: TriggerContext): TriggeredEvalResult {
    const result: TriggeredEvalResult = { applied: 0, skipped: 0, logs: [] };

    if (!bundle || !bundle.blocks) {
        result.logs.push("Invalid bundle: missing blocks");
        return result;
    }

    // 1. Collect and sort binding blocks
    const bindings = Object.values(bundle.blocks)
        .filter((b: any) => 
            b.blockType === "binding" && 
            b.data && 
            b.data.mode === "triggered" && 
            b.data.enabled === true
        )
        .sort((a: any, b: any) => a.blockId.localeCompare(b.blockId));

    for (const binding of bindings) {
        const b = binding as any;
        const blockId = b.blockId;
        const data = b.data;

        try {
            // Check Trigger Match
            if (!data.mapping || !data.mapping.trigger) {
                // Not a valid triggered mapping
                // Should we log/skip? Binding engine skips if trigger doesn't match silently usually.
                // But if mode is triggered and trigger definition is missing, that's invalid config.
                // We'll skip silently if no trigger definition, but log if malformed?
                // Binding engine iterates ALL bindings. Here we filtered by mode=triggered.
                // If trigger info is missing, it cannot match.
                continue; 
            }

            const triggerDef = data.mapping.trigger;
            if (triggerDef.sourceBlockId !== evt.sourceBlockId || triggerDef.name !== evt.name) {
                // No match
                continue;
            }

            // Access Policy Check
            if (data.accessPolicy && data.accessPolicy.expr) {
                const expr = data.accessPolicy.expr;
                let allowed = false;
                
                if (typeof expr === 'object' && expr.kind === 'ref') {
                    if (expr.refType === 'permission') {
                        if (ctx.permissions.has(expr.key)) allowed = true;
                        else result.logs.push(`[${blockId}] Access denied: missing permission '${expr.key}'`);
                    } else if (expr.refType === 'role') {
                        if (ctx.roles.has(expr.key)) allowed = true;
                        else result.logs.push(`[${blockId}] Access denied: missing role '${expr.key}'`);
                    } else {
                        result.logs.push(`[${blockId}] Access denied: unknown refType '${expr.refType}'`);
                    }
                } else {
                    result.logs.push(`[${blockId}] Access denied: unknown expr shape`);
                }

                if (!allowed) {
                    result.skipped++;
                    continue;
                }
            }

            const { kind } = data.mapping;

            // Execute Mapping
            let valueToWrite: any;
            let targetEpId: string | undefined;

            if (kind === 'setLiteral') {
                targetEpId = data.mapping.to;
                valueToWrite = data.mapping.value;
            } else if (kind === 'setFromPayload') {
                 targetEpId = data.mapping.to;
                 if (data.mapping.payloadPath) {
                     valueToWrite = getByPointer(evt.payload || {}, data.mapping.payloadPath);
                 } else {
                     valueToWrite = evt.payload;
                 }
            } else {
                result.logs.push(`[${blockId}] Unsupported mapping kind: ${kind}`);
                result.skipped++;
                continue;
            }

            // Resolve Endpoint
            if (!targetEpId) {
                result.logs.push(`[${blockId}] Missing target mapping 'to'`);
                result.skipped++;
                continue;
            }

            const ep = data.endpoints?.find((e: any) => e.endpointId === targetEpId);
            if (!ep) {
                result.logs.push(`[${blockId}] Missing target endpoint '${targetEpId}'`);
                result.skipped++;
                continue;
            }

            if (ep.direction !== "in" && ep.direction !== "inout") {
                result.logs.push(`[${blockId}] Target endpoint '${targetEpId}' invalid direction '${ep.direction}'`);
                result.skipped++;
                continue;
            }

            const dstBlockId = ep.target?.blockId;
            const dstPath = ep.target?.path;

            if (!dstBlockId || !dstPath) {
                result.logs.push(`[${blockId}] Target endpoint '${targetEpId}' missing target definition`);
                 result.skipped++;
                 continue;
            }

            // Write to Runtime State
            if (!runtimeState[dstBlockId]) {
                runtimeState[dstBlockId] = {};
            }

            const success = setByPointer(runtimeState[dstBlockId], dstPath, valueToWrite);
            if (success) {
                result.applied++;
            } else {
                result.logs.push(`[${blockId}] Failed to set value at ${dstBlockId}:${dstPath}`);
                result.skipped++;
            }

        } catch (e: any) {
            result.logs.push(`[${blockId}] Exception: ${e.message}`);
            result.skipped++;
        }
    }

    return result;
}
