import { promises as fs } from "fs";
import * as path from "path";
import { ActivePointer, ShellBundle, ConfigMeta, ConfigValidation, ShellManifest, BlockEnvelope } from "./ShellConfigTypes";

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
    sysadminBlocks: Record<string, BlockEnvelope>
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

      // Copy All Files (fs.cp requires Node 16.7+)
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
          // Normalize blockId to match filename key
          const blockToSave = { ...block, blockId: key };
          // Note: we don't strictly enforce filename inside block data if it wasn't there, 
          // but repo conventions usually infer filename from file path.
          
          await fs.writeFile(
              path.join(newBundlePath, `${key}.json`),
              JSON.stringify(blockToSave, null, 2),
              "utf-8"
          );
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
      
      await fs.writeFile(
          path.join(newArchivePath, "meta.json"),
          JSON.stringify(meta, null, 2),
          "utf-8"
      );

      // Copy validation.json if exists
      try {
          await (fs as any).cp(
              path.join(baseArchivePath, "validation.json"),
              path.join(newArchivePath, "validation.json")
          );
      } catch {
          // Ignore
      }

      return { newVersionId };
  }
}
