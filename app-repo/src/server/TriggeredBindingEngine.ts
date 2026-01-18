import { ShellBundle } from "./ShellConfigTypes";
import { JsonPointer } from "./JsonPointer";
import { evaluateBoolean } from "./ExpressionEvaluator";

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
  matchedBindings?: MatchedBindingSummary[];
}

export interface MatchedBindingSummary {
    bindingId: string;
    mode: string;
    kind: string;
    summary: string;
}

export function dispatchTriggeredBindings(
  bundle: ShellBundle["bundle"],
  runtimeState: Record<string, any>,
  evt: TriggerEvent,
  ctx: TriggerContext,
  depth: number = 0,
  onIntegrationInvoke?: (inv: any) => void,
  executeIntegrations: boolean = false
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
          const evalCtx = {
              permissions: ctx.permissions,
              roles: ctx.roles,
              ui: ctx.ui || {},
              data: ctx.data || {}
          };
          if (!evaluateBoolean(accessPolicy.expr, evalCtx)) {
              result.skipped++;
              result.logs.push(`[${blockId}] Skipped: Access policy '${JSON.stringify(accessPolicy.expr)}' failed.`);
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

      // Capture Match Trace
      let summary = mapping.kind || 'unknown';
      if (mapping.kind === 'setLiteral') {
         const to0 = (endpoints && endpoints[0]) ? endpoints[0] : null;
         if (to0 && to0.target) {
             summary = `Target: ${to0.target.blockId}${to0.target.path} = ${JSON.stringify(mapping.value)}`;
         }
      } else if (mapping.kind === 'callIntegration') {
          summary = `Integration: ${mapping.integrationId} Method: ${mapping.method || 'GET'} Path: ${mapping.path || '/'}`;
      }

      if (!result.matchedBindings) result.matchedBindings = [];
      result.matchedBindings.push({
          bindingId: blockId,
          mode: (binding as any).mode || 'triggered',
          kind: mapping.kind || 'unknown',
          summary
      });

      // 3.3 Action Logic
      // Validate mapping kind

      if (mapping.kind === "callIntegration") {
          if (!onIntegrationInvoke) {
              result.skipped++;
              result.logs.push(`[${blockId}] Skipped: 'callIntegration' requested but no handler provided.`);
              continue;
          }
          
          const integrationId = mapping.integrationId;
          if (!integrationId) {
             result.skipped++;
             result.logs.push(`[${blockId}] Skipped: 'callIntegration' missing 'integrationId'.`);
             continue;
          }

          // Lookup integration type
          const integrationBlock = bundle.blocks[integrationId];
          const integrationType = integrationBlock ? integrationBlock.blockType : "unknown";
          
          // Phase 4.3.1 & 4.3.2: Dry Run vs Execute Logic
          const integrationConfig = integrationBlock ? integrationBlock.data : {};
          
          let url: string | undefined = undefined;
          // Ensure URL is always computed for HTTP integrations (Rule: always deterministic)
          if (integrationType === 'shell.infra.api.http') {
              const rawBase = (integrationConfig as any)?.baseUrl;
              if (typeof rawBase === 'string' && rawBase) {
                  const base = rawBase.replace(/\/$/, '');
                  const path = (mapping.path || '').replace(/^\//, '');
                  url = `${base}/${path}`;
                  
                  // Update summary with known URL
                  if (result.matchedBindings) {
                      const last = result.matchedBindings[result.matchedBindings.length - 1];
                      if (last && last.bindingId === blockId) {
                          last.summary += ` URL: ${url}`;
                      }
                  }
              } else {
                 // Error: Missing baseUrl
                 onIntegrationInvoke({
                    integrationId,
                    integrationType,
                    method: mapping.method,
                    path: mapping.path,
                    sourceBindingId: blockId,
                    timestamp: new Date().toISOString(),
                    status: 'error',
                    integrationConfig,
                    url: undefined,
                    durationMs: 0,
                    errorMessage: "Integration config missing 'baseUrl'."
                 });
                 result.applied++;
                 result.logs.push(`[${blockId}] Applied: callIntegration -> ${integrationId} (ERROR: missing baseUrl)`);
                 continue;
              }
          }

          if (executeIntegrations && integrationType === 'shell.infra.api.http' && url) {
              // Permission Check: integration.execute
              const hasExecutePerm = ctx.permissions && ctx.permissions.has('integration.execute');

              if (!hasExecutePerm) {
                  // Permission denied
                   onIntegrationInvoke({
                        integrationId,
                        integrationType,
                        method: mapping.method,
                        path: mapping.path,
                        sourceBindingId: blockId,
                        timestamp: new Date().toISOString(),
                        status: 'error',
                        integrationConfig,
                        url,
                        durationMs: 0,
                        errorMessage: 'Missing permission: integration.execute'
                    });
                     result.applied++; // Still counts as applied (attempted)
                     result.logs.push(`[${blockId}] Applied: callIntegration -> ${integrationId} (EXECUTE DENIED: missing integration.execute)`);
                     continue;
              }

              // Execute Mode (Safe HTTP GET only)
              (async () => {
                  const start = Date.now();
                  try {
                      // Safety Checks
                      const parsedUrl = new URL(url);
                      const hostname = parsedUrl.hostname;
                      const allowedHosts = ['localhost', '127.0.0.1', 'example.com'];
                      
                      if (!allowedHosts.includes(hostname)) {
                          throw new Error(`Host '${hostname}' not in allowlist.`);
                      }
                      
                      const method = (mapping.method || 'GET').toUpperCase();
                      if (method !== 'GET') {
                          throw new Error(`Method '${method}' not allowed in debug execute mode (GET only).`);
                      }

                      const controller = new AbortController();
                      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

                      const response = await fetch(url, {
                          method: 'GET',
                          signal: controller.signal
                      });
                      clearTimeout(timeoutId);

                      const text = await response.text();
                      const truncated = text.slice(0, 32 * 1024); // 32KB limit

                      onIntegrationInvoke({
                        integrationId,
                        integrationType,
                        method: mapping.method,
                        path: mapping.path,
                        sourceBindingId: blockId,
                        timestamp: new Date().toISOString(),
                        status: 'success',
                        integrationConfig,
                        url,
                        durationMs: Date.now() - start,
                        httpStatus: response.status,
                        responseSnippet: truncated
                    });
                  } catch (err: any) {
                      onIntegrationInvoke({
                        integrationId,
                        integrationType,
                        method: mapping.method,
                        path: mapping.path,
                        sourceBindingId: blockId,
                        timestamp: new Date().toISOString(),
                        status: 'error',
                        integrationConfig,
                        url,
                        durationMs: Date.now() - start,
                        errorMessage: err.message
                    });
                  }
              })();

              result.applied++;
              result.logs.push(`[${blockId}] Applied: callIntegration -> ${integrationId} (async execute)`);
              continue;

          } else {
            // Dry Run Mode (Default)
            onIntegrationInvoke({
                integrationId,
                integrationType,
                method: mapping.method,
                path: mapping.path,
                sourceBindingId: blockId,
                timestamp: new Date().toISOString(),
                status: 'dry_run',
                integrationConfig,
                url,
                durationMs: 0
            });

            result.applied++;
            result.logs.push(`[${blockId}] Applied: callIntegration -> ${integrationId} (dry_run)`);
            continue;
          }
      }

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
