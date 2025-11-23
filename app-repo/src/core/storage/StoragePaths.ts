export type ProjectUUID = string;
export type MapUUID = string;

export interface StorageRootConfig {
  /** Absolute path to STORAGE_ROOT (single filesystem). */
  storageRoot: string;
}

export interface CorePaths {
  coreDbPath: string;
}

export interface ProjectPaths {
  projectId: ProjectUUID;
  projectRoot: string;
  projectDbPath: string;
  projectTmpRoot: string;
}

export interface MapPaths extends ProjectPaths {
  mapId: MapUUID;
  mapRoot: string;
  mapDbPath: string;
  mapTilesRoot: string;
  mapFilesRoot: string;
  mapTmpRoot: string;
}

export interface ExpectedFile {
  /** Relative path within the tmp/final directory. */
  relativePath: string;
  /** Hex-encoded SHA-256 of file contents. */
  sha256: string;
}

export type ManifestState = "pending" | "committed" | "aborted";

export interface ManifestEntry {
  id?: number;
  opType: string;
  targetPath: string;
  tmpPath: string;
  expectedFiles: ExpectedFile[];
  createdAt: string;
  state: ManifestState;
  committedAt?: string;
  author: string;
  commitTxId?: number;
}

export interface AtomicWritePlan {
  /** Manifest row describing the operation (before state transitions). */
  manifest: ManifestEntry;
  /** Absolute tmp directory where files must be written. */
  tmpDir: string;
  /** Final absolute parent directory that will receive the atomic rename. */
  finalParentDir: string;
}

export interface AtomicWritePlanInput {
  opType: string;
  author: string;
  targetPath: string;
  tmpDir: string;
  expectedFiles: ExpectedFile[];
}

export type AtomicWriteStepType =
  | "acquire_lock"
  | "write_files"
  | "fsync_files"
  | "fsync_tmp_dir"
  | "atomic_rename"
  | "fsync_parent_dir"
  | "update_manifest"
  | "commit_tx"
  | "release_lock";

export interface AtomicWriteStep {
  readonly step: AtomicWriteStepType;
  readonly description: string;
}

export interface AtomicWriteExecutionPlan extends AtomicWritePlan {
  readonly steps: AtomicWriteStep[];
}

/**
 * StoragePaths encapsulates the canonical STORAGE_ROOT layout defined in
 * _AI_STORAGE_ARCHITECTURE.md (Section 2.1 Directory Structure).
 *
 * It is responsible only for computing and validating paths; it does not
 * perform any I/O or create directories.
 */
export interface StoragePaths {
  readonly storageRoot: string;

  /**
   * Compute the canonical paths for core-level storage.
   *
   * STORAGE_ROOT/core/core.db
   */
  getCorePaths(): CorePaths;

  /**
   * Compute canonical project paths under:
   *   STORAGE_ROOT/projects/<projectUUID>/...
   */
  getProjectPaths(projectId: ProjectUUID): ProjectPaths;

  /**
   * Compute canonical map paths under:
   *   STORAGE_ROOT/projects/<projectUUID>/maps/<mapUUID>/...
   */
  getMapPaths(projectId: ProjectUUID, mapId: MapUUID): MapPaths;

  /**
   * Construct an atomic write plan for a given target path and tmp dir.
   *
   * This encodes the manifest structure required by _AI_STORAGE_ARCHITECTURE.md
   * Section 5 and the atomic write sequence from Section 6. It does not perform
   * any filesystem or DB operations.
   */
  buildAtomicWritePlan(input: AtomicWritePlanInput): AtomicWritePlan;

  /**
   * Build a fully ordered execution plan for the atomic write sequence
   * defined in _AI_STORAGE_ARCHITECTURE.md Section 6.1.
   *
   * This API encodes intent only; callers are responsible for
   * performing the actual filesystem / DB operations.
   */
  buildAtomicWriteExecutionPlan(input: AtomicWritePlanInput): AtomicWriteExecutionPlan;
}

export function createStoragePaths(config: StorageRootConfig): StoragePaths {
  const root = normalizeAbsolutePath(config.storageRoot);

  return {
    storageRoot: root,
    getCorePaths(): CorePaths {
      return {
        coreDbPath: joinPaths(root, "core", "core.db"),
      };
    },
    getProjectPaths(projectId: ProjectUUID): ProjectPaths {
      const projectRoot = joinPaths(root, "projects", projectId);
      return {
        projectId,
        projectRoot,
        projectDbPath: joinPaths(projectRoot, "project.db"),
        projectTmpRoot: joinPaths(projectRoot, "tmp"),
      };
    },
    getMapPaths(projectId: ProjectUUID, mapId: MapUUID): MapPaths {
      const project = this.getProjectPaths(projectId);
      const mapRoot = joinPaths(project.projectRoot, "maps", mapId);
      return {
        ...project,
        mapId,
        mapRoot,
        mapDbPath: joinPaths(mapRoot, "map.db"),
        mapTilesRoot: joinPaths(mapRoot, "tiles"),
        mapFilesRoot: joinPaths(mapRoot, "files"),
        mapTmpRoot: joinPaths(mapRoot, "tmp"),
      };
    },
    buildAtomicWritePlan(input: AtomicWritePlanInput): AtomicWritePlan {
      const nowIso = new Date().toISOString();
      const finalParentDir = parentDir(input.targetPath);
      const manifest: ManifestEntry = {
        opType: input.opType,
        targetPath: input.targetPath,
        tmpPath: input.tmpDir,
        expectedFiles: input.expectedFiles,
        createdAt: nowIso,
        state: "pending",
        author: input.author,
      };
      return {
        manifest,
        tmpDir: input.tmpDir,
        finalParentDir,
      };
    },
    buildAtomicWriteExecutionPlan(input: AtomicWritePlanInput): AtomicWriteExecutionPlan {
      const base = this.buildAtomicWritePlan(input);
      const steps: AtomicWriteStep[] = [
        {
          step: "acquire_lock",
          description: "Acquire write lock covering file + DB operations",
        },
        {
          step: "write_files",
          description: "Write all expected files into tmp directory",
        },
        {
          step: "fsync_files",
          description: "fsync each file written into tmp",
        },
        {
          step: "fsync_tmp_dir",
          description: "fsync the tmp directory itself",
        },
        {
          step: "atomic_rename",
          description: "Atomically rename tmp directory to final target path",
        },
        {
          step: "fsync_parent_dir",
          description: "fsync the final parent directory after rename",
        },
        {
          step: "update_manifest",
          description: "Update manifest row state inside DB transaction",
        },
        {
          step: "commit_tx",
          description: "Commit DB transaction with durable sync",
        },
        {
          step: "release_lock",
          description: "Release write lock after successful commit",
        },
      ];

      return {
        ...base,
        steps,
      };
    },
  };
}

function normalizeAbsolutePath(p: string): string {
  if (!p) throw new Error("storageRoot is required");
  // Simple normalization; callers must pass an absolute path.
  return p.replace(/\\+/g, "\\").replace(/\/+$/g, "");
}

function joinPaths(...segments: string[]): string {
  return segments.join("/");
}

function parentDir(path: string): string {
  const parts = path.split("/");
  if (parts.length <= 1) return "";
  parts.pop();
  return parts.join("/");
}
