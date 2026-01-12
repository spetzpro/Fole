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
}
