
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
    
    // Validation: Check Mapping
    if (!mapping || !mapping.kind || mapping.kind !== "copy") {
      result.skipped++;
      result.logs.push(`[${blockId}] Skipped: Unsupported or missing mapping kind. Only 'copy' is supported.`);
      continue;
    }

    if (!endpoints || !Array.isArray(endpoints)) {
        result.skipped++;
        result.logs.push(`[${blockId}] Skipped: No endpoints defined.`);
        continue;
    }

    const fromId = mapping.from;
    const toIds = Array.isArray(mapping.to) ? mapping.to : [mapping.to];

    // Find Source Endpoint
    const fromEndpoint = endpoints.find((e: any) => e.endpointId === fromId);
    if (!fromEndpoint) {
        result.skipped++;
        result.logs.push(`[${blockId}] Skipped: Source endpoint '${fromId}' not found.`);
        continue;
    }

    // Resolve Source Value
    const fromTarget = fromEndpoint.target;
    if (!fromTarget || !fromTarget.blockId || !fromTarget.path) {
         result.skipped++;
         result.logs.push(`[${blockId}] Skipped: Source endpoint '${fromId}' has invalid target definition.`);
         continue;
    }

    const sourceBlockState = runtimeState[fromTarget.blockId];
    if (!sourceBlockState) {
        // Technically this might be valid if block doesn't exist yet, but for derived bindings usually implies input data is missing.
        // We log and skip.
        result.skipped++;
        result.logs.push(`[${blockId}] Skipped: Source block state '${fromTarget.blockId}' not found in runtime.`);
        continue;
    }

    const sourceValue = JsonPointer.getByPointer(sourceBlockState, fromTarget.path);
    if (sourceValue === undefined) {
         // Could assume undefined is the value, but for 'copy' typically implies source path is missing.
         // We will pass undefined through, but if traversal failed it is undefined.
         // Let's allow copying undefined/null, assuming getByPointer returns undefined for missing paths AND actual undefineds.
         // If traversing failed, setByPointer will just set "undefined", which is fine.
    }

    // Apply to Destinations
    let anyApplied = false;
    for (const toId of toIds) {
        const toEndpoint = endpoints.find((e: any) => e.endpointId === toId);
        if (!toEndpoint) {
            result.logs.push(`[${blockId}] Warning: Destination endpoint '${toId}' not found. Skipping this destination.`);
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

        JsonPointer.setByPointer(destBlockState, toTarget.path, sourceValue);
        anyApplied = true;
    }

    if (anyApplied) {
        result.applied++;
    } else {
        result.skipped++; // Failed to apply to any destination
    }
  }

  return result;
}
