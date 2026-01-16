import Ajv from "ajv";
import { promises as fs } from "fs";
import * as path from "path";
import { ShellBundle, ValidationReport, ValidationError } from "./ShellConfigTypes";

type RegionSlot = 'header' | 'viewport' | 'footer';

// Helper for region normalization
function normalizeManifestRegions(regions: Record<string, { blockId: string } | undefined> | undefined): {
    normalized: Partial<Record<RegionSlot, string>>;
    warnings: Array<{ message: string; meta: any }>;
} {
    const result: Partial<Record<RegionSlot, string>> = {};
    const warnings: Array<{ message: string; meta: any }> = [];
    if (!regions) return { normalized: result, warnings };

    const slots: RegionSlot[] = ['header', 'viewport', 'footer'];
    
    slots.forEach(slot => {
        const canonicalKey = slot;
        const legacyKey = slot === 'header' ? 'top' : (slot === 'viewport' ? 'main' : 'bottom');
        
        const canonicalId = regions[canonicalKey]?.blockId;
        const legacyId = regions[legacyKey]?.blockId;
        
        let chosenId: string | undefined;

        if (canonicalId && legacyId) {
            if (canonicalId !== legacyId) {
                warnings.push({
                    message: `manifest.regions conflict for ${slot}: canonical="${canonicalId}" legacy="${legacyId}". Canonical wins.`,
                    meta: { slot, canonical: canonicalId, legacy: legacyId }
                });
            }
            chosenId = canonicalId;
        } else {
            chosenId = canonicalId || legacyId;
        }

        if (chosenId) {
            result[slot] = chosenId;
        }
    });

    return { normalized: result, warnings };
}

export class ShellConfigValidator {
  private ajv: Ajv;
  private schemasLoaded = false;
  private readonly schemaRoot: string;

  constructor(repoRoot: string) {
    this.schemaRoot = path.join(repoRoot, "app-repo", "src", "server", "schemas", "shell");
    this.ajv = new Ajv({ allErrors: true });
  }

  private async ensureSchemas(): Promise<void> {
    if (this.schemasLoaded) return;

    try {
      const coreSchemas = [
        "block-envelope.schema.json",
        "shell-manifest.schema.json",
        "shell-bundle.schema.json",
        "shell.region.header.data.schema.json",
        "shell.region.footer.data.schema.json",
        "shell.rules.viewport.data.schema.json",
        "shell.infra.routing.data.schema.json",
        "shell.infra.theme_tokens.data.schema.json",
        "shell.infra.window_registry.data.schema.json",
        "action-descriptor.schema.json",
        "expression-ast.schema.json",
        "shell.control.button.schema.json",
        "shell.overlay.main_menu.data.schema.json",
        "shell.overlay.advanced_menu.data.schema.json",
        "binding-block.data.schema.json",
        "template-block.data.schema.json"
      ];

      for (const schemaName of coreSchemas) {
          const schemaContent = await this.readSchema(schemaName);
          this.ajv.addSchema(schemaContent, schemaName);
      }

      this.schemasLoaded = true;
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("Failed to load schemas", err);
      throw new Error("Validation initialization failed: " + err.message);
    }
  }

  private getSchemaForBlockType(blockType: string): string | null {
      const exactMap: Record<string, string> = {
          "shell.region.header": "shell.region.header.data.schema.json",
          "shell.region.footer": "shell.region.footer.data.schema.json",
          "shell.rules.viewport": "shell.rules.viewport.data.schema.json",
          "shell.infra.routing": "shell.infra.routing.data.schema.json",
          "shell.infra.theme_tokens": "shell.infra.theme_tokens.data.schema.json",
          "shell.infra.window_registry": "shell.infra.window_registry.data.schema.json",
          "shell.overlay.main_menu": "shell.overlay.main_menu.data.schema.json",
          "shell.overlay.advanced_menu": "shell.overlay.advanced_menu.data.schema.json"
      };

      if (exactMap[blockType]) return exactMap[blockType];
      if (blockType.startsWith("shell.control.button")) return "shell.control.button.schema.json";
      if (blockType === "binding") return "binding-block.data.schema.json";
      if (blockType === "template") return "template-block.data.schema.json";
      
      return null;
  }


  private async readSchema(filename: string): Promise<any> {
    const content = await fs.readFile(path.join(this.schemaRoot, filename), "utf-8");
    return JSON.parse(content);
  }

  async validateBundle(bundle: ShellBundle["bundle"]): Promise<ValidationReport> {
    await this.ensureSchemas();

    const validSchema = this.ajv.validate("shell-bundle.schema.json", bundle);
    
    const errors: ValidationError[] = (this.ajv.errors || []).map(err => ({
      severity: "A1",
      code: err.keyword,
      message: err.message || "Unknown error",
      path: err.instancePath,
    }));

    // Data Shape Validation per Block Type
    for (const blockId of Object.keys(bundle.blocks)) {
        const block = bundle.blocks[blockId];
        const schemaName = this.getSchemaForBlockType(block.blockType);

        if (schemaName) {
            const valid = this.ajv.validate(schemaName, block.data);
            if (!valid) {
                 (this.ajv.errors || []).forEach(err => {
                    errors.push({
                        severity: "A1",
                        code: `data_schema_${err.keyword}`,
                        message: `Block ${blockId} data invalid: ${err.message}`,
                        path: `/blocks/${blockId}/data${err.instancePath}`,
                        blockId: blockId
                    });
                 });
            }
        } else if (block.blockType.startsWith("shell.")) {
             // Unknown shell block type
             // For strictness, if it claims to be a shell.* block but we don't have a schema, flag it.
             // (Optional: could relax this if we expect plugins to extend shell.*)
        }
    }

    const declaredRegions = Object.keys(bundle.manifest.regions || {});
    // 1. Check for valid keys (legacy vs canonical mix is handled by normalization below, 
    // but strict schema might still flag unknown keys if additionalProperties is false. 
    // Assuming schema allows these keys.)

    // Normalize regions for role checking
    const { normalized, warnings: regionWarnings } = normalizeManifestRegions(bundle.manifest.regions);

    // Add normalization warnings to errors as warnings (severity B?) 
    // User requested "Include them in logs array or a non-fatal issues list (stay consistent with existing validation outputs)"
    // Existing severity is A1, A2, B. Let's use B (Info/Warn) if valid.
    regionWarnings.forEach(w => {
        errors.push({
            severity: "B",
            code: "region_conflict",
            message: w.message,
            path: "/manifest/regions",
            meta: w.meta
        });
    });

    // Check normalization entries
    // Also enforce roles: header->shell.region.header, footer->shell.region.footer, viewport->shell.rules.viewport
    const roleMap: Record<string, string> = {
        header: 'shell.region.header',
        footer: 'shell.region.footer',
        viewport: 'shell.rules.viewport'
    };

    // Iterate normalized roles to validate existence and type
    Object.entries(normalized).forEach(([slot, blockId]) => {
        if (!bundle.blocks[blockId]) {
            errors.push({
                severity: "A1",
                code: "missing_block",
                message: `Manifest references missing blockId for region '${slot}' (blockId: ${blockId})`,
                path: `/manifest/regions/${slot}`,
                blockId: blockId
            });
        } else {
            // Role Type Enforcement
            const expectedType = roleMap[slot];
            const actualType = bundle.blocks[blockId].blockType;
            if (expectedType && actualType !== expectedType) {
                errors.push({
                    severity: "A2", // Use A2 for strictness but maybe not critical crash? Or A1? Using A2 to distinguish from missing block.
                    code: "region_role_mismatch",
                    message: `Region '${slot}' expects blockType '${expectedType}', found '${actualType}'`,
                    path: `/manifest/regions/${slot}`,
                    blockId: blockId
                });
            }
        }
    });

    // If schema check was relaxed, we might want to manually ensure 'header', 'viewport', 'footer' existed 
    // via either legacy or canonical keys.
    // The prompt says: "If a role is missing entirely, keep current behavior".
    // Previously schema required ["top", "bottom", "main"].
    // So we should check if 'header', 'footer', 'viewport' are present in normalized.
    ['header', 'viewport', 'footer'].forEach(slot => {
        if (!normalized[slot as RegionSlot]) {
             // Only report if we want to emulate the previous 'required' schema behavior
             // The previous schema validation (via AJV) would have failed before reaching here if we didn't change schema.
             // But we are going to relax schema. So we must report missing required regions here.
             errors.push({
                 severity: "A1",
                 code: "missing_region",
                 message: `Manifest missing required region: '${slot}' (or legacy alias)`,
                 path: `/manifest/regions`
             });
        }
    });

    // Cross-check: openWindow actions vs Window Registry
    // 1. Build registry
    const registeredWindows = new Set<string>();
    const registeredOverlays = new Set<string>();

    for (const blockId of Object.keys(bundle.blocks)) {
        const block = bundle.blocks[blockId];
        if (block.blockType === "shell.infra.window_registry") {
             const windows = (block.data as any).windows || {};
             Object.keys(windows).forEach(k => registeredWindows.add(k));
        }
        if (block.blockType.startsWith("shell.overlay.")) {
            registeredOverlays.add(blockId);
        }
    }

    // 2. Scan buttons for openWindow actions
    for (const blockId of Object.keys(bundle.blocks)) {
         const block = bundle.blocks[blockId];
         if (block.blockType.startsWith("shell.control.button") && block.data.interactions) {
             const interactions = block.data.interactions as Record<string, any>;
             for (const trigger of Object.keys(interactions)) {
                 // handle both direct action or drag object
                 const action = trigger === 'drag' 
                    ? interactions[trigger].dragStart 
                    : interactions[trigger];

                 if (!action) continue;

                 if (action.kind === "openWindow" && action.params && action.params.windowKey) {
                     if (!registeredWindows.has(action.params.windowKey)) {
                         errors.push({
                             severity: "A1",
                             code: "unknown_windowKey",
                             message: `Action references unknown windowKey '${action.params.windowKey}' (not found in any shell.infra.window_registry block)`,
                             path: `/blocks/${blockId}/data/interactions/${trigger}/params/windowKey`,
                             blockId: blockId
                         });
                     }
                 }

                 if (action.kind === "toggleOverlay" && action.params && action.params.overlayId) {
                    if (!registeredOverlays.has(action.params.overlayId)) {
                        errors.push({
                            severity: "A1",
                            code: "unknown_overlayId",
                            message: `Action references unknown overlayId '${action.params.overlayId}' (not found in any shell.overlay.* block)`,
                            path: `/blocks/${blockId}/data/interactions/${trigger}/params/overlayId`,
                            blockId: blockId
                        }); 
                    }
                 }
             }
         }
    }


    // Binding System Graph Validation
    // Pass 1: Collect enabled bindings, check for invalid JSON pointers and missing target blocks
    const derivedEdges: { source: string; target: string; via: string }[] = [];
    const bindingBlockIds = Object.keys(bundle.blocks).filter(id => bundle.blocks[id].blockType === "binding");

    for (const bindId of bindingBlockIds) {
        const block = bundle.blocks[bindId];
        const data = block.data;
        
        // Skip check if explicitly disabled
        if (data.enabled === false) continue;
        
        // Must have endpoints array if schema pass succeeded
        const endpoints = Array.isArray(data.endpoints) ? data.endpoints : [];
        
        // Step 1: Validate Endpoints integrity
        endpoints.forEach((ep: any, index: number) => {
             const targetBlockId = ep.target && ep.target.blockId;
             const targetPath = ep.target && ep.target.path;
             
             // Check referential integrity
             if (targetBlockId && !bundle.blocks[targetBlockId]) {
                 errors.push({
                     severity: "A1",
                     code: "binding_missing_target_block",
                     message: `Binding '${bindId}' references non-existent block '${targetBlockId}'`,
                     path: `/blocks/${bindId}/data/endpoints/${index}/target/blockId`,
                     blockId: bindId
                 });
             }
             
             // Check JSON Pointer syntax
             if (targetPath) {
                 // Basic simplistic check: Must start with / and no spaces.
                 // Real RFC6901 allows spaces if encoded but standard raw string usually lacks them in keys.
                 // We will be strict:
                 if (!targetPath.startsWith("/") || targetPath.includes(" ")) {
                     errors.push({
                         severity: "A1",
                         code: "binding_invalid_json_pointer",
                         message: `Binding '${bindId}' has invalid JSON Pointer path '${targetPath}'`,
                         path: `/blocks/${bindId}/data/endpoints/${index}/target/path`,
                         blockId: bindId
                     });
                 }
             }
        });

        // Step 2: Build Graph for Cycle Detection (Derived Bindings Only)
        // If mode is derived, endpoints with 'in' are sources of data, 'out' are sinks.
        // Wait, standard usage: 
        // Derived: Target (out) is calculated FROM Source (in).
        // So dependency edge is: Target DEPENDS ON Source.
        // Cycle detection usually looks for Source -> Target -> Source cycles in data flow.
        // Let's model DATA FLOW: Source(in) -> Target(out).
        // If A(out) depends on B(in), and B(out) depends on A(in), that's a cycle.
        
        if (data.mode === "derived") {
            const inputs = endpoints.filter((e: any) => e.direction === "in" || e.direction === "inout");
            const outputs = endpoints.filter((e: any) => e.direction === "out" || e.direction === "inout");
            
            // For every output, it depends on every input in THIS binding.
            // Edge: InputBlock -> OutputBlock
            inputs.forEach((inp: any) => {
                outputs.forEach((outp: any) => {
                    if (inp.target?.blockId && outp.target?.blockId && inp.target.blockId !== outp.target.blockId) {
                         derivedEdges.push({ 
                             source: inp.target.blockId, 
                             target: outp.target.blockId,
                             via: bindId 
                         });
                    }
                });
            });
        }
    }

    // Pass 2: Cycle Detection (DFS)
    if (derivedEdges.length > 0) {
        const adjacency: Record<string, string[]> = {};
        derivedEdges.forEach(edge => {
            if (!adjacency[edge.source]) adjacency[edge.source] = [];
            adjacency[edge.source].push(edge.target);
        });

        const visited = new Set<string>();
        const recursionStack = new Set<string>();
        
        // Helper specifically for cycle extraction
        const findCycle = (node: string, path: string[]): string[] | null => {
            visited.add(node);
            recursionStack.add(node);
            path.push(node);

            const neighbors = adjacency[node] || [];
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor)) {
                    const cycle = findCycle(neighbor, path);
                    if (cycle) return cycle;
                } else if (recursionStack.has(neighbor)) {
                    // Cycle detected
                    // Add the neighbor to close the loop list
                    path.push(neighbor);
                    // Filter path to start from the first occurrence of neighbor
                    const startIndex = path.indexOf(neighbor);
                    return path.slice(startIndex);
                }
            }

            recursionStack.delete(node);
            path.pop();
            return null;
        };

        const nodes = Object.keys(adjacency);
        for (const node of nodes) {
            if (!visited.has(node)) {
                const cycle = findCycle(node, []);
                if (cycle) {
                    // Find which binding caused the last link? 
                    // Actually, we fail all bindings involved in future, but for now just error on 'detected'.
                    // We don't easily know which binding ID corresponds to which link in the simple string cycle array.
                    // But we can report the cycle blocks.
                    errors.push({
                        severity: "A1",
                        code: "binding_cycle_detected",
                        message: `Derived Binding Cycle Detected: ${cycle.join(" -> ")}`,
                        path: `/data/blocks`, // General error
                        blockId: "global"
                    });
                    break; // Just report one cycle per pass to avoid noise
                }
            }
        }
    }


    // Core Shell Required Blocks Validation
    const requiredBlockTypes = [
        "shell.region.header",
        "shell.region.footer",
        "shell.rules.viewport",
        "shell.infra.routing",
        "shell.infra.theme_tokens",
        "shell.infra.window_registry",
        "shell.overlay.main_menu"
    ];

    const blockTypeCounts: Record<string, number> = {};
    requiredBlockTypes.forEach(t => blockTypeCounts[t] = 0);

    for (const blockId of Object.keys(bundle.blocks)) {
        const type = bundle.blocks[blockId].blockType;
        if (blockTypeCounts.hasOwnProperty(type)) {
            blockTypeCounts[type]++;
        }
    }

    requiredBlockTypes.forEach(type => {
        if (blockTypeCounts[type] === 0) {
            errors.push({
                severity: "A1",
                code: "shell_missing_required_block",
                message: `Required block type '${type}' is missing from the bundle.`,
                path: "/blocks",
                blockId: "global"
            });
        }
    });

    // Manifest Region Wiring Validation
    // (Consolidated into normalized region check above)


    // Template Reference Validation
    const templateBlocks = Object.values(bundle.blocks).filter(b => b.blockType === "template");
    for (const tpl of templateBlocks) {
        const fieldsToCheck = ["surfaces", "tools", "dataSources", "windows", "buttons", "bindings"];
        for (const field of fieldsToCheck) {
             const refs: string[] = (tpl.data as any)[field] || [];
             if (Array.isArray(refs)) {
                 refs.forEach((refId, index) => {
                     if (!bundle.blocks[refId]) {
                         errors.push({
                            severity: "A1",
                            code: "template_missing_reference",
                            message: `Template '${tpl.blockId}' references missing blockId '${refId}' in field '${field}'`,
                            path: `/blocks/${tpl.blockId}/data/${field}/${index}`,
                            blockId: tpl.blockId
                         });
                     }
                 });
             }
        }
    }

    const errorCount = errors.filter(e => e.severity === "A1").length;
    
    const severityCounts = {
        A1: errorCount,
        A2: errors.filter(e => e.severity === "A2").length,
        B: errors.filter(e => e.severity === "B").length
    };

    return {
      status: errorCount === 0 ? "valid" : "invalid",
      validatorVersion: "1.0.0",
      severityCounts,
      errors
    };
  }
}
