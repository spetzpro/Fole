import type { ProjectId } from "../db/ProjectTypes";
import type { StoragePaths } from "../StoragePaths";

export interface ProjectPaths {
  rootDir: string;
  projectJsonPath: string;
  dbPath: string;
  filesDir: string;
  logsDir: string;
  tmpDir: string;
  cacheDir: string;
}

export interface ProjectPathResolver {
  getProjectPaths(projectId: ProjectId): ProjectPaths;
  getProjectsRoot(): string;
}

export function createProjectPathResolver(storagePaths: StoragePaths): ProjectPathResolver {
  return {
    getProjectPaths(projectId: ProjectId): ProjectPaths {
      const project = storagePaths.getProjectPaths(projectId);
      return {
        rootDir: project.projectRootDir,
        projectJsonPath: project.projectJsonPath,
        dbPath: project.projectDbPath,
        filesDir: project.filesDir,
        logsDir: project.logsDir,
        tmpDir: project.tmpDir,
        cacheDir: project.cacheDir,
      };
    },
    getProjectsRoot(): string {
      return storagePaths.projectsRoot;
    },
  };
}
