import { promises as fs } from "fs";
import * as path from "path";
import { ActivePointer, ShellBundle, ConfigMeta, ConfigValidation, ShellManifest, BlockEnvelope, ResolvedUiGraph, ValidationReport } from "./ShellConfigTypes";

export class ShellConfigRepository {
  private readonly configRoot: string;
  private readonly defaultsRoot: string;
  
  constructor(workspaceFolder: string) {
    this.configRoot = path.join(workspaceFolder, "app-repo", "config", "shell");
    this.defaultsRoot = path.join(workspaceFolder, "app-repo", "config", "defaults", "shell");
  }

  async ensureInitialized(): Promise<void> {
    try {
      await fs.access(path.join(this.configRoot, "active.json"));
    } catch {
      // eslint-disable-next-line no-console
      console.log("Initializing config/shell from defaults...");
      // Using fs.cp which is available in Node > 16.7
      // @ts-ignore - cp might not be in the definition file depending on version
      await (fs as any).cp(this.defaultsRoot, this.configRoot, { recursive: true });
    }
  }

  async getActivePointer(): Promise<ActivePointer | null> {
    const activePath = path.join(this.configRoot, "active.json");
    try {
      const content = await fs.readFile(activePath, "utf-8");
      return JSON.parse(content) as ActivePointer;
    } catch (err: any) {
      if (err.code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  // NG7: Retrieve the Resolved UI Graph for a specific version.
  // This is read from the persisted validation.json artifact if present.
  async getResolvedUiGraph(versionId: string): Promise<ResolvedUiGraph | undefined> {
    const archivePath = path.join(this.configRoot, "archive", versionId);

    if (versionId.includes("..") || versionId.includes("/") || versionId.includes("\\")) {
      throw new Error("Invalid versionId");
    }

    try {
      const validationPath = path.join(archivePath, "validation.json");
      const validationContent = await fs.readFile(validationPath, "utf-8");
      const report = JSON.parse(validationContent) as ValidationReport;
      
      return report.resolvedUiGraph;
    } catch (err: any) {
        if (err.code === "ENOENT") {
            // If validation.json doesn't exist, we could re-run validation on the bundle,
            // but for now we follow the requirement: strict read path.
            // If it's missing, it effectively means no graph is available or version doesn't exist.
            return undefined;
        }
        throw err;
    }
  }

  async getBundle(versionId: string): Promise<ShellBundle> {
    const archivePath = path.join(this.configRoot, "archive", versionId);
    
    if (versionId.includes("..") || versionId.includes("/") || versionId.includes("\\")) {
      throw new Error("Invalid versionId");
    }

    try {
      const metaPath = path.join(archivePath, "meta.json");
      const validationPath = path.join(archivePath, "validation.json");
      const manifestPath = path.join(archivePath, "bundle", "shell.manifest.json");

      const [metaContent, validationContent, manifestContent] = await Promise.all([
        fs.readFile(metaPath, "utf-8"),
        fs.readFile(validationPath, "utf-8"),
        fs.readFile(manifestPath, "utf-8")
      ]);

      const meta = JSON.parse(metaContent) as ConfigMeta;
      const validation = JSON.parse(validationContent) as ConfigValidation;
      const manifest = JSON.parse(manifestContent) as ShellManifest;

      const bundleDir = path.join(archivePath, "bundle");
      const files = await fs.readdir(bundleDir);
      
      const blocks: Record<string, BlockEnvelope> = {};
      
      // We must process sequentially or lock to detect duplicates accurately,
      // because Promise.all + assignment to object might race if we just check 'if exists'.
      // Actually strictly single-threaded event loop means 'if (blocks[id])' is safe in the .map() callback 
      // ONLY IF we don't await between check and set. 
      // But we await readFile. So we should store loaded blocks in array then reduce.
      
      const loadedBlocks = await Promise.all(
          files.map(async (file) => {
             if (!file.endsWith(".json") || file === "shell.manifest.json") return null;
             
             const fileBlockId = file.replace(".json", "");
             const content = await fs.readFile(path.join(bundleDir, file), "utf-8");
             try {
                const data = JSON.parse(content) as BlockEnvelope;
                const finalId = data.blockId || fileBlockId;
                return { id: finalId, data, filename: file };
             } catch (e: any) {
                 console.warn(`Failed to parse block file ${file}: ${e.message}`);
                 return null;
             }
          })
      );

      for (const loaded of loadedBlocks) {
          if (!loaded) continue;
          
          if (blocks[loaded.id]) {
                const existing = blocks[loaded.id] as any;
               throw new Error(`Duplicate blockId validation failure: '${loaded.id}' is defined in multiple files (e.g. ${existing.filename || 'unknown'} and ${loaded.filename}).`);
          }
          // We attach a hidden/temp property to finding the filename later if needed? 
          // BlockEnvelope doesn't natively support it. We'll just cast or ignore.
          // For the check above, we need to know previous filename.
          // Let's rely on the blocks map being clean.
          // Wait, 'blocks' stores BlockEnvelope. 
          // To track filename, we might need a separate map or extend the object.
          // Let's extend the object in memory (it won't hurt JSON serialization usually).
          (loaded.data as any).filename = loaded.filename; 
          blocks[loaded.id] = loaded.data;
      }

      return {
        versionId,
        meta,
        validation,
        bundle: {
          manifest,
          blocks
        }
      };
    } catch (err: any) {
       if (err.code === "ENOENT") {
        throw new Error(`Version ${versionId} not found`);
       }
       throw err;
    }
  }

  async listVersions(limit: number = 25): Promise<Array<{
    versionId: string;
    meta: ConfigMeta | null;
    timestamp: string | null;
    description: string | null;
    mode: string | null;
    hasMeta: boolean;
    hasManifest: boolean;
    blockFileCount: number;
    isActivatable: boolean;
  }>> {
    const archivePath = path.join(this.configRoot, "archive");
    let entries: string[] = [];
    try {
      entries = await fs.readdir(archivePath);
    } catch (err) {
      if ((err as any).code === "ENOENT") return [];
      throw err;
    }
    
    // Sort descending (assuming versionId is timestamp-based or lexicographically comparable)
    // v123 > v122
    const sorted = entries.sort().reverse().slice(0, limit);

    const results = await Promise.all(sorted.map(async (vId) => {
        const versionPath = path.join(archivePath, vId);
        const metaPath = path.join(versionPath, "meta.json");
        const bundlePath = path.join(versionPath, "bundle");
        const manifestPath = path.join(bundlePath, "shell.manifest.json");

        // 1. Meta
        let meta: ConfigMeta | null = null;
        let hasMeta = false;
        try {
            const content = await fs.readFile(metaPath, "utf-8");
            meta = JSON.parse(content);
            hasMeta = true;
        } catch {
            // ignore
        }

        // 2. Manifest & Block Count
        let hasManifest = false;
        let blockFileCount = 0;
        let hasRegions = false;
        
        try {
             // Check manifest
             const manifestContent = await fs.readFile(manifestPath, "utf-8");
             const manifest = JSON.parse(manifestContent);
             hasManifest = true;
             
             if (manifest && manifest.regions) {
                 const r = manifest.regions;
                 // Check for legacy (top/main/bottom) or canonical (header/viewport/footer)
                 if (r.top || r.main || r.bottom || r.header || r.viewport || r.footer) {
                     hasRegions = true;
                 }
             }

             // Count blocks
             const files = await fs.readdir(bundlePath);
             blockFileCount = files.filter(f => f.endsWith(".json") && f !== "shell.manifest.json").length;
        } catch {
             // If manifest check fails or readdir fails (e.g. bundle dir missing)
             // counts stay 0 / false
        }

        const isActivatable = hasManifest && hasMeta && hasRegions && blockFileCount > 0;

        return {
            versionId: vId,
            meta,
            timestamp: meta?.timestamp || null,
            description: meta?.description || null,
            mode: (meta as any)?.mode || null,
            hasMeta,
            hasManifest,
            blockFileCount,
            isActivatable
        };
    }));

    return results;
  }

  async activateVersion(versionId: string, reason?: string, mode: "normal" | "advanced" | "developer" = "developer"): Promise<{ activeVersionId: string, activatedAt: string }> {
      const archivePath = path.join(this.configRoot, "archive", versionId);
      const manifestPath = path.join(archivePath, "bundle", "shell.manifest.json");

      try {
          await fs.access(archivePath);
          await fs.access(manifestPath);
      } catch {
          throw new Error(`Version ${versionId} or its manifest does not exist.`);
      }

      const activePath = path.join(this.configRoot, "active.json");
      let currentActive: any = {};
      try {
          const content = await fs.readFile(activePath, "utf-8");
          currentActive = JSON.parse(content);
      } catch (err: any) {
          if (err.code !== "ENOENT") throw err;
      }

      const now = new Date().toISOString();
      
      const newActive: ActivePointer = {
          ...currentActive,
          activeVersionId: versionId,
          lastUpdated: now,
          activatedAt: now,
          activatedByMode: mode,
          activationReason: reason || null,
          safeMode: currentActive.safeMode ?? false
      };

      const tempPath = activePath + ".tmp";
      await fs.writeFile(tempPath, JSON.stringify(newActive, null, 2), "utf-8");
      await fs.rename(tempPath, activePath);
      
      return { activeVersionId: versionId, activatedAt: now };
  }

  async cloneVersionWithPatchedSysadmin(
    baseVersionId: string, 
    reason: string, 
    sysadminBlocks: Record<string, BlockEnvelope>,
    manifestPatch?: { regions?: Record<string, { blockId: string }> }
  ): Promise<{ newVersionId: string }> {
      const baseArchivePath = path.join(this.configRoot, "archive", baseVersionId);
      const baseBundlePath = path.join(baseArchivePath, "bundle");

      // Validation
      try {
          await fs.access(baseBundlePath);
          await fs.access(path.join(baseBundlePath, "shell.manifest.json"));
      } catch {
          throw new Error(`Base version ${baseVersionId} or its manifest does not exist.`);
      }

      // Generate New Version ID
      const timestamp = new Date();
      const newVersionId = `v${timestamp.getTime()}`;
      const newArchivePath = path.join(this.configRoot, "archive", newVersionId);
      const newBundlePath = path.join(newArchivePath, "bundle");

      // Create Directories
      await fs.mkdir(newArchivePath, { recursive: true });
      await fs.mkdir(newBundlePath, { recursive: true });

      // Copy All Files from Base Bundle
      const files = await fs.readdir(baseBundlePath);
      for (const file of files) {
          await (fs as any).cp(
              path.join(baseBundlePath, file),
              path.join(newBundlePath, file),
              { recursive: true }
          );
      }
      
      // Patch Sysadmin Blocks
      for (const [key, block] of Object.entries(sysadminBlocks)) {
          const targetPath = path.join(newBundlePath, `${key}.json`);
          let mergedData = block.data;

          // SAFEGUARD: If block already exists, merge data to preserve hidden fields (like contentRootId)
          try {
             // We copy files first, so if it existed in base, it exists here.
             const existingContent = await fs.readFile(targetPath, "utf-8");
             const existingBlock = JSON.parse(existingContent);
             
             // If key fields usually preserved by UI are present, we can do a shallow merge
             // We prioritize the NEW data (block.data) but fallback to EXISTING for missing keys
             if (existingBlock && existingBlock.data) {
                 mergedData = { ...existingBlock.data, ...block.data };
             }
          } catch {
             // File doesn't exist (new block), so no merge needed
          }

          // Force blockId match key and filename match structure
          const blockToSave = { 
              ...block, 
              blockId: key,
              filename: `${key}.json`,
              data: mergedData
          };
          
          const tempPath = targetPath + ".tmp";

          await fs.writeFile(
              tempPath,
              JSON.stringify(blockToSave, null, 2),
              "utf-8"
          );
          await fs.rename(tempPath, targetPath);
      }

      // Apply Manifest Patch if present
      if (manifestPatch && manifestPatch.regions) {
          const manifestPath = path.join(newBundlePath, "shell.manifest.json");
          const manifestTempPath = manifestPath + ".tmp";
          
          try {
             const existingManifestContent = await fs.readFile(manifestPath, "utf-8");
             const manifest = JSON.parse(existingManifestContent) as ShellManifest;
             
             // Merge regions (patch overrides existing)
             manifest.regions = { ...manifest.regions, ...manifestPatch.regions };
             
             await fs.writeFile(manifestTempPath, JSON.stringify(manifest, null, 2), "utf-8");
             await fs.rename(manifestTempPath, manifestPath);
          } catch (err: any) {
             console.error(`Failed to patch manifest for version ${newVersionId}: ${err.message}`);
             throw err;
          }
      }

      // Create Meta
      const meta: ConfigMeta = {
          versionId: newVersionId,
          timestamp: timestamp.toISOString(),
          author: "system",
          mode: "normal",
          description: reason ? `Sysadmin patch: ${reason}` : "Sysadmin patch",
          parentVersionId: baseVersionId
      };
      
      const metaPath = path.join(newArchivePath, "meta.json");
      const metaTempPath = metaPath + ".tmp";

      await fs.writeFile(
          metaTempPath,
          JSON.stringify(meta, null, 2),
          "utf-8"
      );
      await fs.rename(metaTempPath, metaPath);

      // Copy validation.json if exists
      try {
          await (fs as any).cp(
              path.join(baseArchivePath, "validation.json"),
              path.join(newArchivePath, "validation.json")
          );
      } catch {
          // Ignore
      }

      // GUARDRAIL: Legacy Normalization
      // Ensure the drafted version uses correct host/rules architecture for viewport
      await this.normalizeViewportRegion(newBundlePath);

      return { newVersionId };
  }

  /**
   * Internal helper to normalize legacy viewport definitions (shell.rules.viewport)
   * into the modern Host/Rules split (shell.region.viewport -> rulesId).
   */
  public async normalizeViewportRegion(bundlePath: string): Promise<void> {
      try {
          const manifestPath = path.join(bundlePath, "shell.manifest.json");
          const manifestContent = await fs.readFile(manifestPath, "utf-8");
          const manifest = JSON.parse(manifestContent) as ShellManifest;

          // Only proceed if viewport region exists
          if (!manifest.regions || !manifest.regions.viewport) return;
          
          const viewportBlockId = manifest.regions.viewport.blockId;
          const viewportBlockPath = path.join(bundlePath, `${viewportBlockId}.json`);

          const blockContent = await fs.readFile(viewportBlockPath, "utf-8");
          const block = JSON.parse(blockContent) as BlockEnvelope;

          // If block is ALREADY the modern host type, nothing to do
          if (block.blockType === "shell.region.viewport") return;

          // If block is the legacy rules type (shell.rules.viewport used as host)
          if (block.blockType === "shell.rules.viewport") {
               // Normalization Step 1: Rename the legacy file/block to allow Host to take the ID
               // Actually we keep legacy file ID but change its content to be Host? 
               // Or rename legacy to rules?
               // Safest: Rename legacy file to *-rules.json, make new file with original ID as Host.

               const rulesBlockId = `${viewportBlockId}-rules`;
               const rulesBlockPath = path.join(bundlePath, `${rulesBlockId}.json`);
               
               // Update legacy block content to define itself as rules
               const rulesBlock = {
                   ...block,
                   blockId: rulesBlockId
                   // Type is already shell.rules.viewport
               };
               
               // Write rules file
               await fs.writeFile(rulesBlockPath, JSON.stringify(rulesBlock, null, 2), "utf-8");

               // Normalization Step 2: Create Host Block using original ID
               // This preserves the Manifest reference (so we don't need to patch manifest blocks)
               const hostBlock: BlockEnvelope = {
                   blockId: viewportBlockId,
                   blockType: "shell.region.viewport",
                   schemaVersion: "1.0.0",
                   data: {
                       rulesId: rulesBlockId,
                       // No implicit contentRootId wiring - purely structural update
                   }
               };
               
               // Preserve existing contentRootId if present (though unlikely in legacy rules block)
               if (block.data && (block.data as any).contentRootId) {
                   (hostBlock.data as any).contentRootId = (block.data as any).contentRootId;
               }

               // Write host file (overwriting the legacy file)
               await fs.writeFile(viewportBlockPath, JSON.stringify(hostBlock, null, 2), "utf-8");
               
               // No implicit creation of root-container
          }

      } catch (err: any) {
          // Log but don't crash - normalization failure shouldn't stop save if possible,
          // though it might leave inconsistencies.
          // eslint-disable-next-line no-console
          console.warn(`[ShellConfigRepository] Normalization failed: ${err.message}`);
      }
  }
}
