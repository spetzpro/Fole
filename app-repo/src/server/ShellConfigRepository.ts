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

      const blocks: Record<string, BlockEnvelope> = {};
      const blockPromises = Object.values(manifest.regions).map(async (region) => {
        const blockId = region.blockId;
        if (!blockId || blockId.includes("/") || blockId.includes("\\")) return;
        
        try {
          const blockContent = await fs.readFile(path.join(archivePath, "bundle", `${blockId}.json`), "utf-8");
          blocks[blockId] = JSON.parse(blockContent) as BlockEnvelope;
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
