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
      const pointer = JSON.parse(content) as ActivePointer;

      // Self-Healing Logic: Check if Active Version Exists AND is Loadable
      let needsHeal = false;
      try {
          // Weak check
          await fs.access(path.join(this.configRoot, "archive", pointer.activeVersionId));
          // Stronger check: Can we read the bundle manifest?
          // We rely on getBundle robustness, but here just do file check to avoid perf hit of full load
          await fs.access(path.join(this.configRoot, "archive", pointer.activeVersionId, "bundle", "shell.manifest.json"));
      } catch {
          needsHeal = true;
      }

      if (needsHeal) {
          // pointer.activeVersionId NOT FOUND or INVALID
          // eslint-disable-next-line no-console
          console.warn(`[ShellConfigRepository] Active version ${pointer.activeVersionId} missing/corrupt. Self-healing...`);
          
          const fallbackVersion = await this.getLatestAvailableVersionId();
          
          if (fallbackVersion) {
              // eslint-disable-next-line no-console
              console.warn(`[ShellConfigRepository] Self-healing active pointer -> ${fallbackVersion}`);
              
              // Patch and Persist
              pointer.activeVersionId = fallbackVersion;
              pointer.activationReason = "Self-Healed: Previous active version missing/corrupt";
              pointer.safeMode = true; // Flag as safe mode if healed
              pointer.safeModeReason = "Restored from archive due to active pointer corruption.";
              
              const tempPath = activePath + ".tmp." + Date.now();
              await fs.writeFile(tempPath, JSON.stringify(pointer, null, 2), "utf-8");
              await fs.rename(tempPath, activePath);
          } else {
              // No versions to fallback to
              console.error("[ShellConfigRepository] Critical: No valid versions found in archive to heal active pointer.");
              return null; 
          }
      }

      return pointer;
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

      const [metaContent, manifestContent] = await Promise.all([
        fs.readFile(metaPath, "utf-8"),
        fs.readFile(manifestPath, "utf-8")
      ]);

      const meta = JSON.parse(metaContent) as ConfigMeta;
      const manifest = JSON.parse(manifestContent) as ShellManifest;

      let validation: ConfigValidation;
      try {
         const validationContent = await fs.readFile(validationPath, "utf-8");
         validation = JSON.parse(validationContent) as ConfigValidation;
      } catch {
         // Graceful fallback for missing validation artifact
         validation = { status: "warn", checkedAt: new Date().toISOString(), warnings: [] };
      }

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

      // GUARDRAIL: Format consistency on Read (In-Memory Only)
      // This ensures that even if disk state is hybrid/legacy, the API served to UI is always canonical.
      const normalizedBundle = ShellConfigRepository.normalizeBundleInMemory({ manifest, blocks });

      return {
        versionId,
        meta,
        validation,
        bundle: normalizedBundle
      };
    } catch (err: any) {
       if (err.code === "ENOENT") {
        throw new Error(`Version ${versionId} not found`);
       }
       throw err;
    }
  }

  /**
   * Scans the archive for the lexicographically latest version.
   * Useful for last-ditch fallback when active pointer is missing or corrupt.
   */
  async getLatestAvailableVersionId(): Promise<string | null> {
      try {
          const archivePath = path.join(this.configRoot, "archive");
          let versions: string[] = [];
          try {
             versions = await fs.readdir(archivePath);
          } catch {
             return null;
          }
          
          if (versions.length === 0) return null;

          // Lexicographically sort descend
          versions.sort().reverse();

          // Scan for first VALID version (has bundle and manifest)
          for (const vid of versions) {
              // Ignore obvious test junk if production-like IDs exist
              if (vid.includes("test") && versions.some(v => !v.includes("test"))) continue;
              
              try {
                  const checkPath = path.join(archivePath, vid, "bundle", "shell.manifest.json");
                  await fs.access(checkPath);
                  return vid;
              } catch {
                  // Skip invalid/incomplete directory
                  console.warn(`[ShellConfigRepository] Skipping incomplete version candidate: ${vid}`);
                  continue;
              }
          }
          
          return null;
      } catch (err) {
          return null;
      }
  }

  /**
   * Pure function to normalize bundle structure in memory.
   * Ensures Viewport is canonical (host=viewport, rules=viewport-rules) and data is clean.
   * Does NOT touch disk.
   */
  public static normalizeBundleInMemory(bundle: ShellBundle["bundle"]): ShellBundle["bundle"] {
      const manifest = { ...bundle.manifest }; // Shallow copy
      if (manifest.regions && manifest.regions.viewport) {
           manifest.regions = { ...manifest.regions, viewport: { ...manifest.regions.viewport } };
      }
      const blocks = { ...bundle.blocks }; // Shallow copy

      if (!manifest.regions || !manifest.regions.viewport) return { manifest, blocks };

      const canonicalHostId = "viewport";
      const canonicalRulesId = "viewport-rules";
      const placeholderHostId = "viewport-placeholder";
      const placeholderRulesId = "viewport-placeholder-rules";

      // Check existence in Blocks map
      const hasCanonicalHost = !!blocks[canonicalHostId];
      const hasPlaceholderHost = !!blocks[placeholderHostId];
      const hasCanonicalRules = !!blocks[canonicalRulesId];
      const hasPlaceholderRules = !!blocks[placeholderRulesId];

      // Only proceed if there's work to do (placeholder exists OR canonical is missing/dirty)
      // Actually we should run always to ensure data cleanliness
      
      // 1. Consolidate HOST Data
      let finalHostData: any = {};
      
      if (hasCanonicalHost) {
          finalHostData = { ...(blocks[canonicalHostId].data || {}) };
      }
      
      if (hasPlaceholderHost) {
          const pData = blocks[placeholderHostId].data || {};
          if (!finalHostData.contentRootId && pData.contentRootId) {
              finalHostData.contentRootId = pData.contentRootId;
          }
           if (!hasCanonicalHost) {
              finalHostData = { ...pData };
          }
      }

      // Enforce Rules Pointer
      finalHostData.rulesId = canonicalRulesId;

      // 2. Consolidate RULES Data
      let finalRulesData: any = {};

      if (hasCanonicalRules) {
          finalRulesData = { ...(blocks[canonicalRulesId].data || {}) };
      }

      if (hasPlaceholderRules) {
          const pData = blocks[placeholderRulesId].data || {};
          if (!hasCanonicalRules) {
              finalRulesData = { ...pData };
          }
      }

      // Clean Rules Data
      delete finalRulesData.contentRootId;
      delete finalRulesData.rulesId;

      // 3. Update Blocks Map
      // Create/Update Canonical Host
      blocks[canonicalHostId] = {
          blockId: canonicalHostId,
          blockType: "shell.region.viewport",
          schemaVersion: "1.0.0",
          data: finalHostData,
          filename: `${canonicalHostId}.json`
      } as BlockEnvelope;

      // Create/Update Canonical Rules
      blocks[canonicalRulesId] = {
          blockId: canonicalRulesId,
          blockType: "shell.rules.viewport",
          schemaVersion: "1.0.0",
          data: finalRulesData,
          filename: `${canonicalRulesId}.json`
      } as BlockEnvelope;

      // 4. Update Manifest
      manifest.regions.viewport.blockId = canonicalHostId;

      // 5. Prune Placeholder Blocks from Memory
      if (hasPlaceholderHost) delete blocks[placeholderHostId];
      if (hasPlaceholderRules) delete blocks[placeholderRulesId];
      
      return { manifest, blocks };
  }

  /**
   * Heals common validation errors in-memory to ensure the bundle is serve-able.
   * Addressed issues:
   * 1. Additional properties in Routing block (sanitizes keys)
   * 2. Canonical Viewport (via normalizeBundleInMemory)
   * 3. Unknown Overlay References (removes interactions pointing to missing overlays)
   */
  public static healBundleInMemory(bundle: ShellBundle["bundle"], report?: ValidationReport): ShellBundle["bundle"] {
      // 1. Run Base Normalization (Viewport Canonicalization)
      const { manifest, blocks } = ShellConfigRepository.normalizeBundleInMemory(bundle);
      
      // 2. Heal Routing Block (Schema Compliance)
      const routingBlock = blocks['routing'];
      if (routingBlock && routingBlock.data && routingBlock.data.routes) {
          const routes = routingBlock.data.routes as Record<string, any>;
          const validRoutes: Record<string, any> = {};
          const keyPattern = /^[a-z0-9-]+$/;
          let dirty = false;
          
          Object.keys(routes).forEach(slug => {
              if (keyPattern.test(slug)) {
                  validRoutes[slug] = routes[slug];
              } else {
                  dirty = true; 
              }
          });
          
          if (dirty) {
              routingBlock.data.routes = validRoutes;
          }
      }

      // 3. Heal Unknown Overlay References
      const knownOverlays = new Set<string>();
      Object.keys(blocks).forEach(id => {
          if (blocks[id].blockType.startsWith('shell.overlay.')) {
              knownOverlays.add(id);
          }
      });
      
      for (const block of Object.values(blocks)) {
           if (!block.data) continue;
           
           if ((block.blockType.startsWith('shell.control.button') || block.blockType === 'ui.atom.button') && block.data.interactions) {
                const interactions = block.data.interactions as Record<string, any>;
                const healedInteractions = { ...interactions };
                let modified = false;

                for (const [trigger, action] of Object.entries(interactions)) {
                     const act = (typeof action === 'object' && action.dragStart) ? action.dragStart : action;
                     if (!act || !act.params) continue;
                     
                     if (act.kind === 'toggleOverlay' && act.params.overlayId) {
                         if (!knownOverlays.has(act.params.overlayId)) {
                             // Disable this interaction by removing it
                             delete healedInteractions[trigger];
                             modified = true;
                         }
                     }
                }
                
                if (modified) {
                    block.data.interactions = healedInteractions;
                }
           }
      }

      return { manifest, blocks };
  }

  async saveHealedBundleAsVersion(
      bundle: ShellBundle["bundle"], 
      baseVersionId: string, 
      reason: string
  ): Promise<{ newVersionId: string }> {
      const timestamp = new Date();
      const newVersionId = `v${timestamp.getTime()}`;
      const archivePath = path.join(this.configRoot, "archive", newVersionId);
      
      // Atomic Write Strategy: Write to .tmp dir, then rename
      const tempArchiveName = `${newVersionId}.tmp.${timestamp.getTime()}`;
      const tempArchivePath = path.join(this.configRoot, "archive", tempArchiveName);
      const tempBundlePath = path.join(tempArchivePath, "bundle");

      // 1. Create structure in temp
      await fs.mkdir(tempBundlePath, { recursive: true });

      const meta: ConfigMeta = {
          versionId: newVersionId,
          timestamp: timestamp.toISOString(),
          author: "system-healer",
          description: reason,
          mode: "normal",
          parentVersionId: baseVersionId
      };
      
      await fs.writeFile(path.join(tempArchivePath, "meta.json"), JSON.stringify(meta, null, 2), "utf-8");
      
      // Write Manifest
      await fs.writeFile(path.join(tempBundlePath, "shell.manifest.json"), JSON.stringify(bundle.manifest, null, 2), "utf-8");

      // Write Blocks
      for (const [id, block] of Object.entries(bundle.blocks)) {
          const filename = (block as any).filename || `${id}.json`;
          await fs.writeFile(path.join(tempBundlePath, filename), JSON.stringify(block, null, 2), "utf-8");
      }

      // 2. Atomic Rename to final location
      // Note: On Windows renaming directories might require them to be on same drive (they are)
      // and target must not exist. Unique ID guarantees target doesn't exist.
      await fs.rename(tempArchivePath, archivePath);

      return { newVersionId };
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
   * ALSO canonicalizes 'viewport-placeholder' IDs to 'viewport'.
   * ENSURES rules data is clean (no contentRootId/rulesId).
   */
  public async normalizeViewportRegion(bundlePath: string): Promise<void> {
      try {
          const manifestPath = path.join(bundlePath, "shell.manifest.json");
          const manifestContent = await fs.readFile(manifestPath, "utf-8");
          const manifest = JSON.parse(manifestContent) as ShellManifest;

          // Only proceed if viewport region exists
          if (!manifest.regions || !manifest.regions.viewport) return;
          
          const canonicalHostId = "viewport";
          const canonicalRulesId = "viewport-rules";
          const placeholderHostId = "viewport-placeholder";
          const placeholderRulesId = "viewport-placeholder-rules";

          const files = await fs.readdir(bundlePath);
          const hasCanonicalHost = files.includes(`${canonicalHostId}.json`);
          const hasPlaceholderHost = files.includes(`${placeholderHostId}.json`);
          const hasCanonicalRules = files.includes(`${canonicalRulesId}.json`);
          const hasPlaceholderRules = files.includes(`${placeholderRulesId}.json`);
          
          // 1. Consolidate HOST Data
          let finalHostData: any = {};
          
          // Prefer canonical host data if available
          if (hasCanonicalHost) {
              const content = await fs.readFile(path.join(bundlePath, `${canonicalHostId}.json`), "utf-8");
              finalHostData = JSON.parse(content).data || {};
          }
          
          // Merge/Fallback to placeholder host data if needed
          if (hasPlaceholderHost) {
              const content = await fs.readFile(path.join(bundlePath, `${placeholderHostId}.json`), "utf-8");
              const pData = JSON.parse(content).data || {};
              
              // If canonical is missing contentRootId, try to rescue it from placeholder
              if (!finalHostData.contentRootId && pData.contentRootId) {
                  finalHostData.contentRootId = pData.contentRootId;
              }
              
              // If we didn't have canonical host at all, start with placeholder data
              if (!hasCanonicalHost) {
                  finalHostData = { ...pData };
              }
          }

          // Enforce pointer to canonical rules
          finalHostData.rulesId = canonicalRulesId;

          // 2. Consolidate RULES Data
          let finalRulesData: any = {};
          
          if (hasCanonicalRules) {
              const content = await fs.readFile(path.join(bundlePath, `${canonicalRulesId}.json`), "utf-8");
              finalRulesData = JSON.parse(content).data || {};
          }
          
          if (hasPlaceholderRules) {
              const content = await fs.readFile(path.join(bundlePath, `${placeholderRulesId}.json`), "utf-8");
              const pData = JSON.parse(content).data || {};
              
              // If no canonical rules, use placeholder data
              if (!hasCanonicalRules) {
                  finalRulesData = { ...pData };
              }
          }
          
          // Clean Rules Data: Remove keys that don't belong in rules
          delete finalRulesData.contentRootId;
          delete finalRulesData.rulesId;

          // 3. Write Canonical Files
          const finalHostBlock: BlockEnvelope = {
              blockId: canonicalHostId,
              blockType: "shell.region.viewport",
              schemaVersion: "1.0.0",
              data: finalHostData
          };

          const finalRulesBlock: BlockEnvelope = {
              blockId: canonicalRulesId,
              blockType: "shell.rules.viewport",
              schemaVersion: "1.0.0",
              data: finalRulesData
          };

          await fs.writeFile(path.join(bundlePath, `${canonicalHostId}.json`), JSON.stringify(finalHostBlock, null, 2), "utf-8");
          await fs.writeFile(path.join(bundlePath, `${canonicalRulesId}.json`), JSON.stringify(finalRulesBlock, null, 2), "utf-8");

          // 4. Update Manifest
          if (manifest.regions.viewport.blockId !== canonicalHostId) {
              manifest.regions.viewport.blockId = canonicalHostId;
              await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
          }

          // 5. Prune Placeholder Files
          if (hasPlaceholderHost) {
             await fs.unlink(path.join(bundlePath, `${placeholderHostId}.json`)).catch(() => {});
          }
          if (hasPlaceholderRules) {
             await fs.unlink(path.join(bundlePath, `${placeholderRulesId}.json`)).catch(() => {});
          }

      } catch (err: any) {
          // eslint-disable-next-line no-console
          console.warn(`[ShellConfigRepository] Normalization failed: ${err.message}`);
      }
  }
}
