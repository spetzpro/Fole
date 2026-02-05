import Ajv from "ajv";
import { promises as fs } from "fs";
import * as path from "path";
import { ShellBundle, ValidationReport, ValidationError, ResolvedUiGraph, ResolvedUiNode, ResolvedValidSlot } from "./ShellConfigTypes";

type RegionSlot = 'header' | 'viewport' | 'footer';

const uiNodeWindowTemplateFields = [
    "title",
    "initialWidth",
    "dockable",
    "helpText",
    "requiredPermission",
    "visibleWhen",
    "enabledWhen"
];
const uiNodeContainerTemplateFields = [
    "direction",
    "gap",
    "helpText",
    "requiredPermission",
    "visibleWhen",
    "enabledWhen"
];
const uiNodeTextTemplateFields = [
    "content",
    "variant",
    "align",
    "helpText",
    "requiredPermission",
    "visibleWhen",
    "enabledWhen"
];

function filterTemplateDefaults(defaults: any, allowedFields: string[]) {
    if (!defaults || typeof defaults !== "object" || Array.isArray(defaults)) return {};
    const result: Record<string, any> = {};
    allowedFields.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(defaults, field)) {
            result[field] = (defaults as Record<string, any>)[field];
        }
    });
    return result;
}

function getRegionBlockId(val: any): string | undefined {
    if (!val) return undefined;
    if (typeof val === 'string') return val;
    if (typeof val === 'object' && val.blockId) return val.blockId;
    return undefined;
}

// Helper for region normalization
function normalizeManifestRegions(regions: Record<string, any> | undefined): {
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
        
        const canonicalId = getRegionBlockId(regions[canonicalKey]);
        const legacyId = getRegionBlockId(regions[legacyKey]);
        
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
  private readonly uiNodeSchemaRoot: string;
  private readonly dataSchemaRoot: string;
  private readonly actionSchemaRoot: string;

  constructor(repoRoot: string) {
    this.schemaRoot = path.join(repoRoot, "app-repo", "src", "server", "schemas", "shell");
    this.uiNodeSchemaRoot = path.join(repoRoot, "app-repo", "src", "server", "schemas", "ui-node");
    this.dataSchemaRoot = path.join(repoRoot, "app-repo", "src", "server", "schemas", "data");
    this.actionSchemaRoot = path.join(repoRoot, "app-repo", "src", "server", "schemas", "action");
    this.ajv = new Ajv({ allErrors: true });
    this.ajv.addKeyword("x-ui-editorHint");
  }

  private async ensureSchemas(): Promise<void> {
    if (this.schemasLoaded) return;

    try {
      // 1. Load legacy shell schemas (Hardcoded list for stability)
      const coreSchemas = [
        "block-envelope.schema.json",
        "shell-manifest.schema.json",
        "shell-bundle.schema.json",
        "shell.region.header.data.schema.json",
        "shell.region.viewport.data.schema.json",
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
        "template-block.data.schema.json",
        "feature.group.schema.json",
        "shell.slot.item.schema.json"
      ];

      for (const schemaName of coreSchemas) {
          const schemaContent = await this.readSchema(this.schemaRoot, schemaName);
          this.ajv.addSchema(schemaContent, schemaName);
      }

      // 2. Load v2 ui-node schemas (Dynamic scan)
      try {
        const nodeFiles = await fs.readdir(this.uiNodeSchemaRoot);
        for (const file of nodeFiles) {
            if (file.endsWith(".schema.json")) {
                const content = await this.readSchema(this.uiNodeSchemaRoot, file);
                if (!this.ajv.getSchema(file)) {
                    this.ajv.addSchema(content, file);
                }
            }
        }
      } catch (e: any) {
        if (e.code !== 'ENOENT') throw e;
      }

      // 3. Load Action Schemas (Dynamic scan)
      try {
        const actionFiles = await fs.readdir(this.actionSchemaRoot);
        for (const file of actionFiles) {
            if (file.endsWith(".schema.json")) {
                const content = await this.readSchema(this.actionSchemaRoot, file);
                if (!this.ajv.getSchema(file)) {
                    this.ajv.addSchema(content, file);
                }
            }
        }
      } catch (e: any) {
         if (e.code !== 'ENOENT') throw e;
      }

      // 4. Load Data Schemas (Dynamic scan)
      try {
        const dataFiles = await fs.readdir(this.dataSchemaRoot);
        for (const file of dataFiles) {
            if (file.endsWith(".schema.json")) {
                const content = await this.readSchema(this.dataSchemaRoot, file);
                if (!this.ajv.getSchema(file)) {
                    this.ajv.addSchema(content, file);
                }
            }
        }
      } catch (e: any) {
         if (e.code !== 'ENOENT') throw e;
      }

      this.schemasLoaded = true;
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("Failed to load schemas", err);
      throw new Error("Validation initialization failed: " + err.message);
    }
  }

    public getSchemaForBlockType(blockType: string): string | null {
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
      if (blockType === "feature.group") return "feature.group.schema.json";
      if (blockType === "shell.slot.item") return "shell.slot.item.schema.json";
      if (blockType === "action.openWindow") return "action.openWindow.schema.json";
      if (blockType.startsWith("ui.node.")) return `${blockType}.schema.json`;
      
      return null;
  }


  private async readSchema(root: string, filename: string): Promise<any> {
    const content = await fs.readFile(path.join(root, filename), "utf-8");
    return JSON.parse(content);
  }

    private deepMerge(base: any, override: any): any {
        if (Array.isArray(override)) return override;
        if (override && typeof override === "object" && !Array.isArray(override)) {
            const baseObj = (base && typeof base === "object" && !Array.isArray(base)) ? base : {};
            const result: any = { ...baseObj };
            Object.keys(override).forEach(key => {
                const next = (override as any)[key];
                if (next === undefined) return;
                result[key] = this.deepMerge((baseObj as any)[key], next);
            });
            return result;
        }
        return override !== undefined ? override : base;
    }

    private stripNullTombstones(value: any): any {
        if (!value || typeof value !== "object" || Array.isArray(value)) return value;
        const result: any = {};
        Object.keys(value).forEach(key => {
            if (key === "__proto__" || key === "prototype" || key === "constructor") return;
            const next = (value as any)[key];
            if (next === null) return;
            if (next && typeof next === "object" && !Array.isArray(next)) {
                result[key] = this.stripNullTombstones(next);
            } else {
                result[key] = next;
            }
        });
        return result;
    }

    private applyNullTombstones(base: any, overrides: any): any {
        if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) return base;
        const result: any = this.deepMerge(base, {});
        Object.keys(overrides).forEach(key => {
            if (key === "__proto__" || key === "prototype" || key === "constructor") return;
            const next = (overrides as any)[key];
            if (next === null) {
                delete result[key];
                return;
            }
            if (next && typeof next === "object" && !Array.isArray(next)) {
                const childBase = result[key] && typeof result[key] === "object" && !Array.isArray(result[key]) ? result[key] : {};
                result[key] = this.applyNullTombstones(childBase, next);
            }
        });
        return result;
    }

    private resolveUiNodeButtonData(
        blockId: string,
        block: any,
        bundle: ShellBundle["bundle"],
        errors?: ValidationError[]
    ): any {
        const data = block?.data || {};
        const inheritFrom = data?.inheritFrom;
        if (!inheritFrom || typeof inheritFrom !== "string") return data;

        const templateBlock = bundle.blocks?.[inheritFrom];
        if (!templateBlock) {
            errors?.push({
                severity: "A1",
                code: "template_missing",
                message: `Block ${blockId} inheritFrom references missing template '${inheritFrom}'`,
                path: `/blocks/${blockId}/data/inheritFrom`,
                blockId
            });
            return data;
        }

        if (templateBlock.blockType !== "template") {
            errors?.push({
                severity: "A1",
                code: "template_type_mismatch",
                message: `Block ${blockId} inheritFrom '${inheritFrom}' is not a template block`,
                path: `/blocks/${blockId}/data/inheritFrom`,
                blockId
            });
            return data;
        }

        const templateData = templateBlock.data || {};
        if (templateData?.inheritFrom) {
            errors?.push({
                severity: "A1",
                code: "template_inherit_forbidden",
                message: `Template '${inheritFrom}' must not inherit from another template in v1`,
                path: `/blocks/${inheritFrom}/data/inheritFrom`,
                blockId: inheritFrom
            });
            return data;
        }

        if (templateData?.targetBlockType !== "ui.node.button") {
            errors?.push({
                severity: "A1",
                code: "template_target_mismatch",
                message: `Template '${inheritFrom}' does not target ui.node.button`,
                path: `/blocks/${inheritFrom}/data/targetBlockType`,
                blockId: inheritFrom
            });
            return data;
        }

        if (!templateData?.defaults || typeof templateData.defaults !== "object" || Array.isArray(templateData.defaults)) {
            errors?.push({
                severity: "A1",
                code: "template_defaults_invalid",
                message: `Template '${inheritFrom}' missing defaults object`,
                path: `/blocks/${inheritFrom}/data/defaults`,
                blockId: inheritFrom
            });
            return data;
        }

        const baseData = { ...data } as any;
        const overrides = { ...data } as any;
        delete overrides.inheritFrom;
        const withDefaults = this.deepMerge(templateData.defaults, baseData);
        return this.deepMerge(withDefaults, overrides);
    }

    private resolveUiNodeWindowData(
        blockId: string,
        block: any,
        bundle: ShellBundle["bundle"],
        errors?: ValidationError[]
    ): any {
        const data = block?.data || {};
        const inheritFrom = data?.inheritFrom;
        if (!inheritFrom || typeof inheritFrom !== "string") return data;

        const templateBlock = bundle.blocks?.[inheritFrom];
        if (!templateBlock) {
            errors?.push({
                severity: "A1",
                code: "template_missing",
                message: `Block ${blockId} inheritFrom references missing template '${inheritFrom}'`,
                path: `/blocks/${blockId}/data/inheritFrom`,
                blockId
            });
            return data;
        }

        const templateData = templateBlock?.data || {};
        if (templateBlock.blockType !== "template") {
            errors?.push({
                severity: "A1",
                code: "template_type_mismatch",
                message: `Block ${blockId} inheritFrom '${inheritFrom}' is not a template block`,
                path: `/blocks/${blockId}/data/inheritFrom`,
                blockId
            });
            return data;
        }

        if (templateData?.inheritFrom) {
            errors?.push({
                severity: "A1",
                code: "template_inherit_forbidden",
                message: `Template '${inheritFrom}' must not inherit from another template in v1`,
                path: `/blocks/${inheritFrom}/data/inheritFrom`,
                blockId: inheritFrom
            });
            return data;
        }

        if (templateData?.targetBlockType !== "ui.node.window") {
            errors?.push({
                severity: "A1",
                code: "template_target_mismatch",
                message: `Template '${inheritFrom}' does not target ui.node.window`,
                path: `/blocks/${inheritFrom}/data/targetBlockType`,
                blockId: inheritFrom
            });
            return data;
        }

        if (!templateData?.defaults || typeof templateData.defaults !== "object" || Array.isArray(templateData.defaults)) {
            errors?.push({
                severity: "A1",
                code: "template_defaults_invalid",
                message: `Template '${inheritFrom}' missing defaults object`,
                path: `/blocks/${inheritFrom}/data/defaults`,
                blockId: inheritFrom
            });
            return data;
        }

        const baseData = { ...data } as any;
        const overrides = { ...data } as any;
        delete overrides.inheritFrom;
        const filteredDefaults = filterTemplateDefaults(templateData.defaults, uiNodeWindowTemplateFields);
        const baseMinus = this.applyNullTombstones(baseData, overrides);
        const overridesWithoutNulls = this.stripNullTombstones(overrides);
        const withDefaults = this.deepMerge(baseMinus, filteredDefaults);
        return this.deepMerge(withDefaults, overridesWithoutNulls);
    }

    private resolveUiNodeContainerData(
        blockId: string,
        block: any,
        bundle: ShellBundle["bundle"],
        errors?: ValidationError[]
    ): any {
        const data = block?.data || {};
        const inheritFrom = data?.inheritFrom;
        if (!inheritFrom || typeof inheritFrom !== "string") return data;

        const templateBlock = bundle.blocks?.[inheritFrom];
        if (!templateBlock) {
            errors?.push({
                severity: "A1",
                code: "template_missing",
                message: `Block ${blockId} inheritFrom references missing template '${inheritFrom}'`,
                path: `/blocks/${blockId}/data/inheritFrom`,
                blockId
            });
            return data;
        }

        const templateData = templateBlock?.data || {};
        if (templateBlock.blockType !== "template") {
            errors?.push({
                severity: "A1",
                code: "template_type_mismatch",
                message: `Block ${blockId} inheritFrom '${inheritFrom}' is not a template block`,
                path: `/blocks/${blockId}/data/inheritFrom`,
                blockId
            });
            return data;
        }

        if (templateData?.inheritFrom) {
            errors?.push({
                severity: "A1",
                code: "template_inherit_forbidden",
                message: `Template '${inheritFrom}' must not inherit from another template in v1`,
                path: `/blocks/${inheritFrom}/data/inheritFrom`,
                blockId: inheritFrom
            });
            return data;
        }

        if (templateData?.targetBlockType !== "ui.node.container") {
            errors?.push({
                severity: "A1",
                code: "template_target_mismatch",
                message: `Template '${inheritFrom}' does not target ui.node.container`,
                path: `/blocks/${inheritFrom}/data/targetBlockType`,
                blockId: inheritFrom
            });
            return data;
        }

        if (!templateData?.defaults || typeof templateData.defaults !== "object" || Array.isArray(templateData.defaults)) {
            errors?.push({
                severity: "A1",
                code: "template_defaults_invalid",
                message: `Template '${inheritFrom}' missing defaults object`,
                path: `/blocks/${inheritFrom}/data/defaults`,
                blockId: inheritFrom
            });
            return data;
        }

        const baseData = { ...data } as any;
        const overrides = { ...data } as any;
        delete overrides.inheritFrom;
        const filteredDefaults = filterTemplateDefaults(templateData.defaults, uiNodeContainerTemplateFields);
        const baseMinus = this.applyNullTombstones(baseData, overrides);
        const overridesWithoutNulls = this.stripNullTombstones(overrides);
        const withDefaults = this.deepMerge(baseMinus, filteredDefaults);
        return this.deepMerge(withDefaults, overridesWithoutNulls);
    }

    private resolveUiNodeTextData(
        blockId: string,
        block: any,
        bundle: ShellBundle["bundle"],
        errors?: ValidationError[]
    ): any {
        const data = block?.data || {};
        const inheritFrom = data?.inheritFrom;
        if (!inheritFrom || typeof inheritFrom !== "string") return data;

        const templateBlock = bundle.blocks?.[inheritFrom];
        if (!templateBlock) {
            errors?.push({
                severity: "A1",
                code: "template_missing",
                message: `Block ${blockId} inheritFrom references missing template '${inheritFrom}'`,
                path: `/blocks/${blockId}/data/inheritFrom`,
                blockId
            });
            return data;
        }

        const templateData = templateBlock?.data || {};
        if (templateBlock.blockType !== "template") {
            errors?.push({
                severity: "A1",
                code: "template_type_mismatch",
                message: `Block ${blockId} inheritFrom '${inheritFrom}' is not a template block`,
                path: `/blocks/${blockId}/data/inheritFrom`,
                blockId
            });
            return data;
        }

        if (templateData?.inheritFrom) {
            errors?.push({
                severity: "A1",
                code: "template_inherit_forbidden",
                message: `Template '${inheritFrom}' must not inherit from another template in v1`,
                path: `/blocks/${inheritFrom}/data/inheritFrom`,
                blockId: inheritFrom
            });
            return data;
        }

        if (templateData?.targetBlockType !== "ui.node.text") {
            errors?.push({
                severity: "A1",
                code: "template_target_mismatch",
                message: `Template '${inheritFrom}' does not target ui.node.text`,
                path: `/blocks/${inheritFrom}/data/targetBlockType`,
                blockId: inheritFrom
            });
            return data;
        }

        if (!templateData?.defaults || typeof templateData.defaults !== "object" || Array.isArray(templateData.defaults)) {
            errors?.push({
                severity: "A1",
                code: "template_defaults_invalid",
                message: `Template '${inheritFrom}' missing defaults object`,
                path: `/blocks/${inheritFrom}/data/defaults`,
                blockId: inheritFrom
            });
            return data;
        }

        const baseData = { ...data } as any;
        const overrides = { ...data } as any;
        delete overrides.inheritFrom;
        const filteredDefaults = filterTemplateDefaults(templateData.defaults, uiNodeTextTemplateFields);
        const baseMinus = this.applyNullTombstones(baseData, overrides);
        const overridesWithoutNulls = this.stripNullTombstones(overrides);
        const withDefaults = this.deepMerge(baseMinus, filteredDefaults);
        return this.deepMerge(withDefaults, overridesWithoutNulls);
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
        const hasTemplate = (block.blockType === "ui.node.button" || block.blockType === "ui.node.window" || block.blockType === "ui.node.container" || block.blockType === "ui.node.text") && !!block?.data?.inheritFrom;

        if (schemaName) {
            if (!(hasTemplate && (block.blockType === "ui.node.button" || block.blockType === "ui.node.window" || block.blockType === "ui.node.container" || block.blockType === "ui.node.text"))) {
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
            }
        } else if (block.blockType.startsWith("shell.")) {
             // Unknown shell block type
             // For strictness, if it claims to be a shell.* block but we don't have a schema, flag it.
             // (Optional: could relax this if we expect plugins to extend shell.*)
        }

        if (block.blockType === "template") {
            const tData = block.data || {};
            if (tData.targetBlockType && (!tData.defaults || typeof tData.defaults !== "object" || Array.isArray(tData.defaults))) {
                errors.push({
                    severity: "A1",
                    code: "template_defaults_invalid",
                    message: `Template ${blockId} missing defaults object for targetBlockType`,
                    path: `/blocks/${blockId}/data/defaults`,
                    blockId
                });
            }
        }

        if (block.blockType === "ui.node.button" && hasTemplate && schemaName) {
            const effective = this.resolveUiNodeButtonData(blockId, block, bundle, errors);
            const valid = this.ajv.validate(schemaName, effective);
            if (!valid) {
                (this.ajv.errors || []).forEach(err => {
                    errors.push({
                        severity: "A1",
                        code: `effective_schema_${err.keyword}`,
                        message: `Block ${blockId} effective data invalid: ${err.message}`,
                        path: `/blocks/${blockId}/effective${err.instancePath}`,
                        blockId: blockId
                    });
                });
            }
        }

        if (block.blockType === "ui.node.window" && hasTemplate && schemaName) {
            const effective = this.resolveUiNodeWindowData(blockId, block, bundle, errors);
            const valid = this.ajv.validate(schemaName, effective);
            if (!valid) {
                (this.ajv.errors || []).forEach(err => {
                    errors.push({
                        severity: "A1",
                        code: `effective_schema_${err.keyword}`,
                        message: `Block ${blockId} effective data invalid: ${err.message}`,
                        path: `/blocks/${blockId}/effective${err.instancePath}`,
                        blockId: blockId
                    });
                });
            }
        }

        if (block.blockType === "ui.node.container" && hasTemplate && schemaName) {
            const effective = this.resolveUiNodeContainerData(blockId, block, bundle, errors);
            const valid = this.ajv.validate(schemaName, effective);
            if (!valid) {
                (this.ajv.errors || []).forEach(err => {
                    errors.push({
                        severity: "A1",
                        code: `effective_schema_${err.keyword}`,
                        message: `Block ${blockId} effective data invalid: ${err.message}`,
                        path: `/blocks/${blockId}/effective${err.instancePath}`,
                        blockId: blockId
                    });
                });
            }
        }

        if (block.blockType === "ui.node.text" && hasTemplate && schemaName) {
            const effective = this.resolveUiNodeTextData(blockId, block, bundle, errors);
            const valid = this.ajv.validate(schemaName, effective);
            if (!valid) {
                (this.ajv.errors || []).forEach(err => {
                    errors.push({
                        severity: "A1",
                        code: `effective_schema_${err.keyword}`,
                        message: `Block ${blockId} effective data invalid: ${err.message}`,
                        path: `/blocks/${blockId}/effective${err.instancePath}`,
                        blockId: blockId
                    });
                });
            }
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
    // Also enforce roles: header->shell.region.header, footer->shell.region.footer, viewport->shell.region.viewport
    const roleMap: Record<string, string> = {
        header: 'shell.region.header',
        footer: 'shell.region.footer',
        viewport: 'shell.region.viewport'
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

    // NG3: V2 UI-Node Graph Compilation (Preflight Integrity Check)
    let resolvedUiGraph: ResolvedUiGraph | undefined;
    try {
        resolvedUiGraph = this.compileUiGraph(bundle);
    } catch (err: any) {
        // If compilation throws a specific validation-like error (e.g. cycle),
        // we map it to the report.
        if (err.isUiGraphError) {
             errors.push({
                 severity: "A1", // Critical
                 code: "ui_graph_compile_failed",
                 message: err.message,
                 path: err.path || "/blocks",
                 blockId: err.blockId
             });
        } else {
             // Unexpected compiler crash
             throw err;
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
      errors,
      // NG5 Fix: Return graph even if bundle has other validation errors (e.g. missing infra blocks)
      // This allows debug tools (like Button Node Editor) to function on imperfect bundles.
      resolvedUiGraph: resolvedUiGraph
    };
  }

  // NG3/NG5 Implementation: Minimal Graph Compiler
  // Validates integrity of v2 ui.node.* blocks and returns ResolvedUiGraph.
  private compileUiGraph(bundle: ShellBundle["bundle"]): ResolvedUiGraph | undefined {
      const uiNodes = Object.values(bundle.blocks).filter(b => b.blockType.startsWith("ui.node."));
      if (uiNodes.length === 0) return undefined;

      // Map for quick lookup
      const nodeMap = new Map<string, any>();
      uiNodes.forEach(n => nodeMap.set(n.blockId, n));

      const nodesById: Record<string, ResolvedUiNode> = {};
      const slotsById: Record<string, ResolvedValidSlot> = {};
      const allChildIds = new Set<string>();
      let edgeCount = 0;

      // 1. Validate Children Existence & Edges & Build Graph & Slots
      nodeMap.forEach((node, id) => {
          const children = (node.data as any).children || [];
          const resolvedChildren: string[] = [];
          
          if (Array.isArray(children)) {
              children.forEach((childRef: any, index: number) => {
                  let childId: string | undefined;
                  
                  // Support both string ID and { blockId: "..." } object
                  if (typeof childRef === 'string') childId = childRef;
                  else if (typeof childRef === 'object' && childRef.blockId) childId = childRef.blockId;

                  if (!childId) return; // Ignore malformed children (schema validation handles types)

                  // Check existence: Must exist in the MAIN bundle
                  if (!bundle.blocks[childId]) {
                      const err: any = new Error(`Node '${id}' references missing child '${childId}'`);
                      err.isUiGraphError = true;
                      err.blockId = id;
                      err.path = `/blocks/${id}/data/children/${index}`;
                      throw err;
                  }

                  resolvedChildren.push(childId);
                  allChildIds.add(childId);
                  edgeCount++;
              });
          }

          const props = node.blockType === "ui.node.button"
              ? this.resolveUiNodeButtonData(id, node, bundle)
              : node.data;

          nodesById[id] = {
              id: id,
              type: node.blockType,
              props: props, // Pass through data as props (so behaviors are available)
              children: resolvedChildren
          };

          // NG6: Populate "children" slot
          // In the future, specialized nodes might have named slots (e.g. window.toolbar).
          // For now, the generic "children" array maps to a child-type slot.
          const slotId = `${id}:children`;
          slotsById[slotId] = {
              id: slotId,
              ownerNodeId: id,
              kind: "children",
              childIds: resolvedChildren
          };
      });

      // 2. Cycle Detection (DFS)
      const visited = new Set<string>();
      const recursionStack = new Set<string>();

      const checkCycle = (currentId: string) => {
          if (recursionStack.has(currentId)) {
              // Cycle detected
              const err: any = new Error(`Cycle detected in UI Graph involving node '${currentId}'`);
              err.isUiGraphError = true;
              err.blockId = currentId;
              err.path = `/blocks/${currentId}`;
              throw err;
          }
          if (visited.has(currentId)) return;

          visited.add(currentId);
          recursionStack.add(currentId);

          const node = bundle.blocks[currentId];
          // Follow edges into non-UI nodes if referenced? 
          // For now, strict UI graph usually stays within UI nodes. 
          // But missing child check ensures existence. Cycle check should follow links.
          // Since validateBundle passes referencing non-ui nodes, we should only check children if it IS a known structure.
          // But cycle check logic below only looked at bundle.blocks... ok.

          if (node) { // We know it exists from previous pass
              const children = (node.data as any).children;
              if (children && Array.isArray(children)) {
                  children.forEach((childRef: any) => {
                      let childId: string | undefined;
                      if (typeof childRef === 'string') childId = childRef;
                      else if (typeof childRef === 'object' && childRef.blockId) childId = childRef.blockId;
                      
                      if (childId && bundle.blocks[childId]) {
                          checkCycle(childId);
                      }
                  });
              }
          }

          recursionStack.delete(currentId);
      };

      // Run DFS from every UI node
      // (Even if node is in allChildIds, we run it to be safe, visited set optimizes)
      for (const id of nodeMap.keys()) {
          checkCycle(id);
      }

      // 3. Determine Roots (UI nodes not referenced as children by other UI nodes)
      // Note: This logic only considers intra-graph references. 
      // If a node is referenced by a non-UI node (like a Layout), it might still be a "root" of the UI graph.
      // Def: Roots are nodes with in-degree 0 within the set of UI nodes.
      const rootNodeIds = uiNodes
          .map(n => n.blockId)
          .filter(id => !allChildIds.has(id));

      return {
          nodesById,
          slotsById,
          rootNodeIds,
          diagnostics: {
              nodeCount: uiNodes.length,
              edgeCount
          }
      };
  }
}
