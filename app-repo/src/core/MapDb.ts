import type { CoreRuntime } from "./CoreRuntime";
import type { DbConnection } from "./db/DalContext";

export interface MapDbPaths {
  readonly projectId: string;
  readonly mapId: string;
  readonly dbPath: string;
}

export class MapDb {
  constructor(private readonly runtime: CoreRuntime) {}

  getMapDbPath(projectId: string, mapId: string): MapDbPaths {
    const mapPaths = this.runtime.storagePaths.getMapPaths(projectId, mapId);

    return {
      projectId,
      mapId,
      dbPath: mapPaths.mapDbPath,
    };
  }

  async getConnection(projectId: string, mapId: string): Promise<DbConnection> {
    const handle = this.runtime.dal.getMapDb(projectId, mapId);
    return handle.getConnection();
  }
}
