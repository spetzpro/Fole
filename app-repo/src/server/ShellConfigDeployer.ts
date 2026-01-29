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

  async deploy(bundleInput: ShellBundle["bundle"], message?: string, forceInvalid?: boolean): Promise<{ activeVersionId: string; activatedAt: string; report: ValidationReport; safeMode: boolean }> {
    // 1. Resolve Parent & Construct Candidate Bundle (PATCH Semantics)
    // We do this BEFORE validation so that partial bundles can be patched onto the valid parent.
    const parentVersionId = (await this.repo.getActivePointer())?.activeVersionId || null;
    let parentBundle: ShellBundle["bundle"] | null = null;

    if (parentVersionId) {
        try {
             const parent = await this.repo.getBundle(parentVersionId);
             parentBundle = parent.bundle;
        } catch (err: any) {
             console.warn(`[Deployer] Failed to resolve parent ${parentVersionId} for merge: ${err.message}`);
        }
    }

    // Start with parent as base, or empty if no parent
    const candidateBundle: ShellBundle["bundle"] = recursiveCopy(parentBundle) || {
        manifest: { ...bundleInput.manifest },
        blocks: { ...bundleInput.blocks }
    };

    if (parentBundle) {
        // Overlay Manifest (Shallow merge of top-level, deep merge of regions)
        candidateBundle.manifest = { ...parentBundle.manifest, ...bundleInput.manifest };
        
        // Defensive merge of regions to prevent data loss if UI sends partial/empty regions
        if (parentBundle.manifest.regions || bundleInput.manifest.regions) {
            candidateBundle.manifest.regions = {
                ...(parentBundle.manifest.regions || {}),
                ...(bundleInput.manifest.regions || {})
            };
        }

        // Overlay Blocks
        for (const [blockId, inputBlock] of Object.entries(bundleInput.blocks)) {
            // Skip explicit nulls/undefined to prevent overwriting existing parent blocks with nothing
            if (!inputBlock) continue;

            let finalBlock = inputBlock;

            // Safe Data Merge (Preserve hidden fields from parent)
            if (candidateBundle.blocks[blockId]) {
                const parentBlock = candidateBundle.blocks[blockId];
                // If both have data objects, shallow merge them (Input wins, but Parent keys preserved)
                if (parentBlock.data && (inputBlock as any).data) {
                    finalBlock = {
                        ...inputBlock,
                        data: { ...parentBlock.data, ...(inputBlock as any).data }
                    };
                }
            }
            
            candidateBundle.blocks[blockId] = finalBlock;
        }
    } else {
        // No parent: Use input as is (Full replacement / First deploy)
        candidateBundle.manifest = bundleInput.manifest;
        candidateBundle.blocks = bundleInput.blocks;
    }

    // 2. Validate the Merged Candidate
    const report = await this.validator.validateBundle(candidateBundle);
    
    let isSafeMode = false;
    let safeModeReason: string | undefined;

    // 3. Reject if any error (A1 severity)
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

    // 4. Generate Version ID
    const versionId = `v${Date.now()}`;
    const archivePath = path.join(this.configRoot, "archive", versionId);
    const bundlePath = path.join(archivePath, "bundle");

    // 5. Write Archive
    await fs.mkdir(bundlePath, { recursive: true });

    // Write meta.json
    const meta = {
      versionId,
      author: "system", // In real system, pass author from user context
      timestamp: new Date().toISOString(),
      description: message || "Deployed via API",
      mode: isSafeMode ? "developer" : "normal",
      parentVersionId: parentVersionId
    };

    await fs.writeFile(path.join(archivePath, "meta.json"), JSON.stringify(meta, null, 2));

    // Write validation.json
    await fs.writeFile(path.join(archivePath, "validation.json"), JSON.stringify(report, null, 2));

    // Write manifest
    if (!candidateBundle.manifest.schemaVersion) candidateBundle.manifest.schemaVersion = "1.0.0";
    await fs.writeFile(path.join(bundlePath, "shell.manifest.json"), JSON.stringify(candidateBundle.manifest, null, 2));

    // Write blocks
    for (const [blockId, blockData] of Object.entries(candidateBundle.blocks)) {
         await fs.writeFile(path.join(bundlePath, `${blockId}.json`), JSON.stringify(blockData, null, 2));
    }

    // GUARDRAIL: Legacy Normalization
    // Ensure the drafted version uses correct host/rules architecture for viewport
    // (This uses the same robust logic as clone-and-patch, now acting on the fully merged bundle)
    await (this.repo as any).normalizeViewportRegion(bundlePath);

    // 6. Activate (Atomic Update)
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

// Helper to deep clone simple objects (JSON safe) to avoid mutation side effects
function recursiveCopy<T>(obj: T): T {
    if (obj === undefined || obj === null) return obj;
    return JSON.parse(JSON.stringify(obj));
}
