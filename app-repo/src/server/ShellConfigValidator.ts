import Ajv from "ajv";
import { promises as fs } from "fs";
import * as path from "path";
import { ShellBundle, ValidationReport, ValidationError } from "./ShellConfigTypes";

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
        "action-descriptor.schema.json",
        "shell.control.button.schema.json",
        "shell.overlay.main_menu.data.schema.json",
        "shell.overlay.advanced_menu.data.schema.json"
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
          "shell.overlay.main_menu": "shell.overlay.main_menu.data.schema.json",
          "shell.overlay.advanced_menu": "shell.overlay.advanced_menu.data.schema.json"
      };

      if (exactMap[blockType]) return exactMap[blockType];
      if (blockType.startsWith("shell.control.button")) return "shell.control.button.schema.json";
      
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

    // Check for missing blocks referenced in manifest
    // This goes beyond simple schema validation
    const declaredRegions = Object.keys(bundle.manifest.regions || {});
    for (const region of declaredRegions) {
      const blockId = bundle.manifest.regions[region].blockId;
      // console.log(`Checking region ${region} -> blockId ${blockId}. In blocks? ${!!bundle.blocks[blockId]}`);
      if (!bundle.blocks[blockId]) {
        errors.push({
          severity: "A1",
          code: "missing_block",
          message: `Manifest references missing blockId: ${blockId}`,
          path: `/manifest/regions/${region}/blockId`,
          blockId: blockId
        });
      }
    }

    const errorCount = errors.filter(e => e.severity === "A1").length;
    
    if (errorCount === 0) {
      return {
        status: "valid",
        validatorVersion: "1.0.0",
        severityCounts: { A1: 0, A2: 0, B: 0 },
        errors: []
      };
    }

    return {
      status: "invalid",
      validatorVersion: "1.0.0",
      severityCounts: {
        A1: errorCount,
        A2: errors.filter(e => e.severity === "A2").length,
        B: errors.filter(e => e.severity === "B").length
      },
      errors
    };
  }
}
