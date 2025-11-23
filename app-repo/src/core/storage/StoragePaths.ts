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
