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
      const envelopeParams = await this.readSchema("block-envelope.schema.json");
      const manifestParams = await this.readSchema("shell-manifest.schema.json");
      const bundleParams = await this.readSchema("shell-bundle.schema.json");

      this.ajv.addSchema(envelopeParams, "block-envelope.schema.json");
      this.ajv.addSchema(manifestParams, "shell-manifest.schema.json");
      this.ajv.addSchema(bundleParams, "shell-bundle.schema.json");

      this.schemasLoaded = true;
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("Failed to load schemas", err);
      throw new Error("Validation initialization failed: " + err.message);
    }
  }

  private async readSchema(filename: string): Promise<any> {
    const content = await fs.readFile(path.join(this.schemaRoot, filename), "utf-8");
    return JSON.parse(content);
  }

  async validateBundle(bundle: ShellBundle["bundle"]): Promise<ValidationReport> {
    await this.ensureSchemas();

    const validSchema = this.ajv.validate("shell-bundle.schema.json", bundle);
    
    const errors: ValidationError[] = (this.ajv.errors || []).map(err => ({
      severity: "error",
      code: err.keyword,
      message: err.message || "Unknown error",
      path: err.instancePath,
    }));

    // Check for missing blocks referenced in manifest
    // This goes beyond simple schema validation
    const declaredRegions = Object.keys(bundle.manifest.regions || {});
    for (const region of declaredRegions) {
      const blockId = bundle.manifest.regions[region].blockId;
      // console.log(`Checking region ${region} -> blockId ${blockId}. In blocks? ${!!bundle.blocks[blockId]}`);
      if (!bundle.blocks[blockId]) {
        errors.push({
          severity: "error",
          code: "missing_block",
          message: `Manifest references missing blockId: ${blockId}`,
          path: `/manifest/regions/${region}/blockId`,
          blockId: blockId
        });
      }
    }

    const errorCount = errors.filter(e => e.severity === "error").length;
    
    if (errorCount === 0) {
      return {
        status: "valid",
        validatorVersion: "1.0.0",
        severityCounts: { error: 0, warning: 0, info: 0 },
        errors: []
      };
    }

    return {
      status: "invalid",
      validatorVersion: "1.0.0",
      severityCounts: {
        error: errorCount,
        warning: errors.filter(e => e.severity === "warning").length,
        info: 0
      },
      errors
    };
  }
}
