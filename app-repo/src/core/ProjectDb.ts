import type { CoreRuntime } from "./CoreRuntime";

// Minimal project DB path helper wired to storage architecture spec.
// Spec: STORAGE_ROOT/projects/<projectId>/project.db

export interface ProjectDbPaths {
  readonly projectId: string;
  readonly dbPath: string;
}

export class ProjectDb {
  constructor(private readonly runtime: CoreRuntime) {}

  getProjectDbPath(projectId: string): ProjectDbPaths {
    const projectPaths = this.runtime.storagePaths.getProjectPaths(projectId);

    return {
      projectId,
      dbPath: `${projectPaths.projectRoot}/project.db`,
    };
  }
}
