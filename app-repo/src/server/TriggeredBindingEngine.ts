import { ShellBundle } from "./ShellConfigTypes";
import { JsonPointer } from "./JsonPointer";

export interface TriggerEvent {
  sourceBlockId: string;
  sourcePath: string;        // JSON pointer where the event originated
  name: string;              // event name, e.g. "click" or "signal"
  payload?: any;             // optional payload
}

export interface TriggerContext {
  permissions: Set<string>;
  roles: Set<string>;
  ui?: any;
  data?: any;
}

export interface TriggeredBindingResult {
  applied: number;
  skipped: number;
  logs: string[];
}

function evaluateBoolean(expr: string, ctx: TriggerContext): boolean {
    // MVP Access Policy: 
    // If expr is a string, treat it as a required permission.
    // e.g. "admin_access" -> ctx.permissions.has("admin_access")
    return ctx.permissions.has(expr);
}

export function dispatchTriggeredBindings(
  bundle: ShellBundle["bundle"],
  runtimeState: Record<string, any>,
  evt: TriggerEvent,
  ctx: TriggerContext,
  depth: number = 0
): TriggeredBindingResult {
  const result: TriggeredBindingResult = { applied: 0, skipped: 0, logs: [] };
  
  // Cascade Limit Check
  if (depth >= 32) {
      result.logs.push("[System] Cascade limit reached (depth >= 32). Stopping.");
      return result;
  }

  const bindings: any[] = [];

  // 1. Collect Valid Bindings
  for (const blockId of Object.keys(bundle.blocks)) {
    const block = bundle.blocks[blockId];
    if (block.blockType === "binding" && block.data) {
       const data = block.data as any;
       // Only enabled triggered bindings
       if (data.enabled === true && data.mode === "triggered") {
         bindings.push({ blockId, ...data });
       }
    }
  }

  // 2. Sort Deterministically (blockId ascending)
  bindings.sort((a, b) => a.blockId.localeCompare(b.blockId));

  // 3. Process
  for (const binding of bindings) {
      const { blockId, mapping, endpoints, accessPolicy } = binding;
    
      // 3.1 Access Policy Gating
      if (accessPolicy && accessPolicy.expr) {
          if (!evaluateBoolean(accessPolicy.expr, ctx)) {
              result.skipped++;
              result.logs.push(`[${blockId}] Skipped: Access policy '${accessPolicy.expr}' failed.`);
              continue;
          }
      }

      // 3.2 Trigger Match
      if (!mapping || !mapping.trigger) {
          // Can't trigger if no trigger definition
          // Not necessarily an error if we scan all bindings, but for this specific event loop we only care about matches
          continue; 
      }

      const { sourceBlockId, name } = mapping.trigger;
      
      // Strict match for MVP
      if (sourceBlockId !== evt.sourceBlockId || name !== evt.name) {
          continue; // Not a match, plain skip (don't count as "skipped" in metrics, just irrelevant)
      }

      // 3.3 Action Logic
      // Validate mapping kind
      if (mapping.kind !== "setLiteral" && mapping.kind !== "setFromPayload") {
          result.skipped++;
          result.logs.push(`[${blockId}] Skipped: Unsupported triggered mapping kind '${mapping.kind}'.`);
          continue;
      }

      // Determine value to write
      let valueToWrite: any = undefined;

      if (mapping.kind === "setLiteral") {
          if (!Object.prototype.hasOwnProperty.call(mapping, "value")) {
             result.skipped++;
             result.logs.push(`[${blockId}] Skipped: 'setLiteral' missing 'value'.`);
             continue;
          }
          valueToWrite = mapping.value;
      } else if (mapping.kind === "setFromPayload") {
          if (mapping.payloadPath) {
              // Try to resolve path from payload
              valueToWrite = JsonPointer.getByPointer(evt.payload, mapping.payloadPath);
          } else {
              // Use entire payload
              valueToWrite = evt.payload;
          }
      }

      // 3.4 Apply to Destinations
      let toIds = mapping.to;
      if (!toIds) {
        result.skipped++;
        result.logs.push(`[${blockId}] Skipped: Mapping missing 'to' field.`);
        continue;
      }
      
      if (!Array.isArray(toIds)) toIds = [toIds];
      if (!endpoints || !Array.isArray(endpoints)) {
        result.skipped++;
        result.logs.push(`[${blockId}] Skipped: No endpoints defined to resolve 'to'.`);
        continue;
      }

      let anyApplied = false;
      for (const toId of toIds) {
          const toEndpoint = endpoints.find((e: any) => e.endpointId === toId);
          if (!toEndpoint) {
              result.logs.push(`[${blockId}] Warning: Destination endpoint '${toId}' not found.`);
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
          result.logs.push(`[${blockId}] Applied: ${mapping.kind}`);
      } else {
          result.skipped++;
      }
  }

  return result;
}
