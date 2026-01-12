
import { ShellBundle } from "./ShellConfigTypes";
import { JsonPointer } from "./JsonPointer";

export interface BindingEngineResult {
  applied: number;
  skipped: number;
  logs: string[];
}

export function applyDerivedBindings(
  bundle: ShellBundle["bundle"],
  runtimeState: Record<string, any>
): BindingEngineResult {
  const result: BindingEngineResult = { applied: 0, skipped: 0, logs: [] };
  const bindings: any[] = [];

  // 1. Collect Valid Bindings
  for (const blockId of Object.keys(bundle.blocks)) {
    const block = bundle.blocks[blockId];
    if (block.blockType === "binding" && block.data) {
       const data = block.data as any;
       if (data.enabled === true && data.mode === "derived") {
         bindings.push({ blockId, ...data });
       }
    }
  }

  // 2. Sort Deterministically
  bindings.sort((a, b) => a.blockId.localeCompare(b.blockId));

  // 3. Process
  for (const binding of bindings) {
    const { blockId, mapping, endpoints } = binding;
    
    // Validation: Check Mapping Kind
    if (!mapping || !mapping.kind || (mapping.kind !== "copy" && mapping.kind !== "setLiteral")) {
      result.skipped++;
      result.logs.push(`[${blockId}] Skipped: Unsupported or missing mapping kind.`);
      continue;
    }

    if (!endpoints || !Array.isArray(endpoints)) {
        result.skipped++;
        result.logs.push(`[${blockId}] Skipped: No endpoints defined.`);
        continue;
    }

    // Determine value to write
    let valueToWrite: any = undefined;

    if (mapping.kind === "copy") {
        const fromId = mapping.from;
        if (!fromId) {
             result.skipped++;
             result.logs.push(`[${blockId}] Skipped: 'copy' mapping missing 'from' endpointId.`);
             continue;
        }

        const fromEndpoint = endpoints.find((e: any) => e.endpointId === fromId);
        if (!fromEndpoint) {
            result.skipped++;
            result.logs.push(`[${blockId}] Skipped: Source endpoint '${fromId}' not found.`);
            continue;
        }

        // Direction Check: Source must be 'out' or 'inout'
        if ((fromEndpoint as any).direction !== "out" && (fromEndpoint as any).direction !== "inout") {
            result.skipped++;
            result.logs.push(`[${blockId}] Skipped: Source endpoint '${fromId}' direction invalid for reading.`);
            continue;
        }

        const fromTarget = fromEndpoint.target;
        if (!fromTarget || !fromTarget.blockId || !fromTarget.path) {
            result.skipped++;
            result.logs.push(`[${blockId}] Skipped: Source endpoint '${fromId}' has invalid target definition.`);
            continue;
        }

        const sourceBlockState = runtimeState[fromTarget.blockId];
        if (!sourceBlockState) {
            result.skipped++;
            result.logs.push(`[${blockId}] Skipped: Source block state '${fromTarget.blockId}' not found in runtime.`);
            continue;
        }

        valueToWrite = JsonPointer.getByPointer(sourceBlockState, fromTarget.path);

    } else if (mapping.kind === "setLiteral") {
        if (!Object.prototype.hasOwnProperty.call(mapping, "value")) {
             result.skipped++;
             result.logs.push(`[${blockId}] Skipped: 'setLiteral' mapping missing 'value' property.`);
             continue;
        }
        valueToWrite = mapping.value;
    }

    // Apply to Destinations (Common Logic)
    let toIds = mapping.to;
    if (!toIds) {
        result.skipped++;
        result.logs.push(`[${blockId}] Skipped: Mapping missing 'to' field.`);
        continue;
    }
    if (!Array.isArray(toIds)) toIds = [toIds];

    let anyApplied = false;
    for (const toId of toIds) {
        const toEndpoint = endpoints.find((e: any) => e.endpointId === toId);
        if (!toEndpoint) {
            result.logs.push(`[${blockId}] Warning: Destination endpoint '${toId}' not found. Skipping this destination.`);
            continue;
        }

        // Direction Check: Destination must be 'in' or 'inout'
        if ((toEndpoint as any).direction !== "in" && (toEndpoint as any).direction !== "inout") {
            result.logs.push(`[${blockId}] Warning: Destination endpoint '${toId}' direction invalid for writing.`);
            continue;
        }

        const toTarget = toEndpoint.target;
        if (!toTarget || !toTarget.blockId || !toTarget.path) {
            result.logs.push(`[${blockId}] Warning: Destination endpoint '${toId}' has invalid target. Skipping.`);
            continue;
        }

        const destBlockState = runtimeState[toTarget.blockId];
        if (!destBlockState) {
             result.logs.push(`[${blockId}] Warning: Destination block state '${toTarget.blockId}' not found. Skipping.`);
             continue;
        }

        JsonPointer.setByPointer(destBlockState, toTarget.path, valueToWrite);
        anyApplied = true;
    }

    if (anyApplied) {
        result.applied++;
    } else {
        result.skipped++;
    }
  }

  return result;
}
