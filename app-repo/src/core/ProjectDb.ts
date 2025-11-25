import type { CoreRuntime } from "./CoreRuntime";
import type { DbConnection } from "./db/DalContext";

// Minimal project DB helper wired to storage architecture spec and DAL.
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

  async getConnection(projectId: string): Promise<DbConnection> {
    const handle = this.runtime.dal.getProjectDb(projectId);
    return handle.getConnection();
  }
}
