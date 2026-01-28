import { promises as fs } from "fs";
import * as path from "path";
import { ShellConfigRepository } from "./ShellConfigRepository";
import { ShellConfigValidator } from "./ShellConfigValidator";
import { ShellBundle, ActivePointer, ValidationReport } from "./ShellConfigTypes";

export class ShellConfigDeployer {
  private readonly configRoot: string;

  constructor(
    private readonly repo: ShellConfigRepository,
    private readonly validator: ShellConfigValidator,
    workspaceFolder: string
  ) {
    this.configRoot = path.join(workspaceFolder, "app-repo", "config", "shell");
  }

  async deploy(bundle: ShellBundle["bundle"], message?: string, forceInvalid?: boolean): Promise<{ activeVersionId: string; activatedAt: string; report: ValidationReport; safeMode: boolean }> {
    // 1. Validate
    const report = await this.validator.validateBundle(bundle);
    
    let isSafeMode = false;
    let safeModeReason: string | undefined;

    // 2. Reject if any error (A1 severity)
    if (report.severityCounts.A1 > 0) {
      if (forceInvalid) {
         // Check flag
         const allowForce = process.env.FOLE_DEV_FORCE_INVALID_CONFIG === "1" || process.env.FOLE_DEV_FORCE_INVALID_CONFIG === "true";
         if (!allowForce) {
            throw { status: 403, message: "Force deployment of invalid config is disabled on this server.", report };
         }
         isSafeMode = true;
         safeModeReason = "Forced deployment of invalid configuration (DEV mode).";
      } else {
         const errorMsg = "Deployment rejected due to validation errors.";
         // eslint-disable-next-line no-console
         console.error(errorMsg, JSON.stringify(report.errors));
         throw { status: 400, message: errorMsg, report };
      }
    }

    // 3. Generate Version ID
    const versionId = `v${Date.now()}`;
    const archivePath = path.join(this.configRoot, "archive", versionId);
    const bundlePath = path.join(archivePath, "bundle");

    // 4. Write Archive
    await fs.mkdir(bundlePath, { recursive: true });

    // Write meta.json
    const meta = {
      versionId,
      author: "system", // In real system, pass author from user context
      timestamp: new Date().toISOString(),
      description: message || "Deployed via API",
      mode: isSafeMode ? "developer" : "normal",
      parentVersionId: (await this.repo.getActivePointer())?.activeVersionId || null
    };
    await fs.writeFile(path.join(archivePath, "meta.json"), JSON.stringify(meta, null, 2));

    // Write validation.json
    await fs.writeFile(path.join(archivePath, "validation.json"), JSON.stringify(report, null, 2));

    // Write manifest
    // Ensure manifest has schemaVersion if missing (though validation should catch it)
    if (!bundle.manifest.schemaVersion) bundle.manifest.schemaVersion = "1.0.0";
    await fs.writeFile(path.join(bundlePath, "shell.manifest.json"), JSON.stringify(bundle.manifest, null, 2));

    // Write blocks
    for (const [blockId, blockData] of Object.entries(bundle.blocks)) {
         await fs.writeFile(path.join(bundlePath, `${blockId}.json`), JSON.stringify(blockData, null, 2));
    }

    // GUARDRAIL: Legacy Normalization
    // Ensure the drafted version uses correct host/rules architecture for viewport
    // (This uses the same robust logic as clone-and-patch to ensure manually pushed bundles are safe)
    await (this.repo as any).normalizeViewportRegion(bundlePath);

    // 5. Activate (Atomic Update)
    const activatedAt = meta.timestamp;
    await this.updateActivePointer(versionId, activatedAt, {
        safeMode: isSafeMode,
        mode: isSafeMode ? "developer" : "normal",
        reason: safeModeReason,
        report: isSafeMode ? report : undefined
    });

    return { activeVersionId: versionId, activatedAt, report, safeMode: isSafeMode };
  }

  async rollback(targetVersionId: string): Promise<{ activeVersionId: string; activatedAt: string }> {
     // Verify target exists
     try {
        await fs.access(path.join(this.configRoot, "archive", targetVersionId, "meta.json"));
     } catch {
       throw { status: 404, message: `Version ${targetVersionId} not found in archive.` };
     }

     const activatedAt = new Date().toISOString();
     await this.updateActivePointer(targetVersionId, activatedAt, {
         safeMode: false,
         mode: "normal"
     });
     
     return { activeVersionId: targetVersionId, activatedAt };
  }

  private async updateActivePointer(versionId: string, timestamp: string, options: { safeMode: boolean; mode: "normal" | "advanced" | "developer"; reason?: string; report?: ValidationReport }): Promise<void> {
    const pointer: ActivePointer = {
      activeVersionId: versionId,
      lastUpdated: timestamp,
      activatedAt: timestamp,
      safeMode: options.safeMode,
      activatedByMode: options.mode,
      safeModeReason: options.reason,
      safeModeReport: options.report
    };
    
    // Atomic write
    const activePath = path.join(this.configRoot, "active.json");
    const tempPath = path.join(this.configRoot, `active.json.${Date.now()}.tmp`);
    
    await fs.writeFile(tempPath, JSON.stringify(pointer, null, 2));
    await fs.rename(tempPath, activePath);
  }
}
