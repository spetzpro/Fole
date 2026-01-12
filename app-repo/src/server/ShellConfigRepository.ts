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
      const blockPromises = files.map(async (file) => {
        if (!file.endsWith(".json") || file === "shell.manifest.json") return;
        
        // We assume the filename is the blockId for simplicity in loading, 
        // though the content has the real blockId.
        const blockId = file.replace(".json", "");
        
        try {
          const blockContent = await fs.readFile(path.join(bundleDir, file), "utf-8");
          const blockData = JSON.parse(blockContent) as BlockEnvelope;
          // Use the ID from the file content if available, else filename
          blocks[blockData.blockId || blockId] = blockData;
        } catch (e: any) {
          // eslint-disable-next-line no-console
          console.warn(`Failed to load block ${blockId}: ${e.message}`);
        }
      });


      await Promise.all(blockPromises);

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
