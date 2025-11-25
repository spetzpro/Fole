import type { ProjectUUID, StoragePaths } from "../StoragePaths";

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
  getProjectPaths(projectId: ProjectUUID): ProjectPaths;
  getProjectsRoot(): string;
}

export function createProjectPathResolver(storagePaths: StoragePaths): ProjectPathResolver {
  return {
    getProjectPaths(projectId: ProjectUUID): ProjectPaths {
      const project = storagePaths.getProjectPaths(projectId);
      return {
        rootDir: project.projectRoot,
        projectJsonPath: `${project.projectRoot}/project.json`,
        dbPath: project.projectDbPath,
        filesDir: `${project.projectRoot}/files`,
        logsDir: `${project.projectRoot}/logs`,
        tmpDir: project.projectTmpRoot,
        cacheDir: `${project.projectRoot}/cache`,
      };
    },
    getProjectsRoot(): string {
      return `${storagePaths.storageRoot}/projects`;
    },
  };
}
