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

  async deploy(bundle: ShellBundle["bundle"], message?: string): Promise<{ activeVersionId: string; activatedAt: string; report: ValidationReport }> {
    // 1. Validate
    const report = await this.validator.validateBundle(bundle);
    
    // 2. Reject if any error (A1 severity)
    if (report.severityCounts.error > 0) {
      const errorMsg = "Deployment rejected due to validation errors.";
      // eslint-disable-next-line no-console
      console.error(errorMsg, JSON.stringify(report.errors));
      throw { status: 400, message: errorMsg, report };
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
      mode: "normal",
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

    // 5. Activate (Atomic Update)
    const activatedAt = meta.timestamp;
    await this.updateActivePointer(versionId, activatedAt);

    return { activeVersionId: versionId, activatedAt, report };
  }

  async rollback(targetVersionId: string): Promise<{ activeVersionId: string; activatedAt: string }> {
     // Verify target exists
     try {
        await fs.access(path.join(this.configRoot, "archive", targetVersionId, "meta.json"));
     } catch {
       throw { status: 404, message: `Version ${targetVersionId} not found in archive.` };
     }

     const activatedAt = new Date().toISOString();
     await this.updateActivePointer(targetVersionId, activatedAt);
     
     return { activeVersionId: targetVersionId, activatedAt };
  }

  private async updateActivePointer(versionId: string, timestamp: string): Promise<void> {
    const pointer: ActivePointer = {
      activeVersionId: versionId,
      lastUpdated: timestamp
    };
    
    // Atomic write
    const activePath = path.join(this.configRoot, "active.json");
    const tempPath = path.join(this.configRoot, `active.json.${Date.now()}.tmp`);
    
    await fs.writeFile(tempPath, JSON.stringify(pointer, null, 2));
    await fs.rename(tempPath, activePath);
  }
}
