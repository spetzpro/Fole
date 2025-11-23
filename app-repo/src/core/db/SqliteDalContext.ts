import type { ProjectUUID, MapUUID } from "../storage/StoragePaths";
import type {
  CoreDbHandle,
  DbConnection,
  DbEngine,
  DalContext,
  MapDbHandle,
  ProjectDbHandle,
  TransactionOptions,
} from "./DalContext";
import type { StoragePaths } from "../storage/StoragePaths";

export interface SqliteDbConnection extends DbConnection {
  readonly engine: "sqlite";
  readonly dbFilePath: string;
  /** Placeholder for future sqlite driver handle. */
  readonly raw: unknown;
}

interface SqliteEngineConfig {
  readonly flags?: string[];
}

class SqliteConnectionImpl implements SqliteDbConnection {
  readonly engine: "sqlite" = "sqlite";
  readonly dbFilePath: string;
  readonly raw: unknown = null;

  constructor(dbFilePath: string) {
    this.dbFilePath = dbFilePath;
  }
}

abstract class BaseSqliteHandle {
  protected readonly dbPath: string;
  protected readonly engineConfig: SqliteEngineConfig;

  protected constructor(dbPath: string, engineConfig: SqliteEngineConfig) {
    this.dbPath = dbPath;
    this.engineConfig = engineConfig;
  }

  async getConnection(): Promise<SqliteDbConnection> {
    // Future: open or fetch a sqlite handle with correct PRAGMAs.
    return new SqliteConnectionImpl(this.dbPath);
  }

  async runInTransaction<T>(fn: (conn: DbConnection) => Promise<T>, _options?: TransactionOptions): Promise<T> {
    const conn = await this.getConnection();
    // Future: wrap callback inside BEGIN/COMMIT/ROLLBACK.
    return fn(conn);
  }
}

class SqliteCoreDbHandle extends BaseSqliteHandle implements CoreDbHandle {
  constructor(dbPath: string, engineConfig: SqliteEngineConfig) {
    super(dbPath, engineConfig);
  }
}

class SqliteProjectDbHandle extends BaseSqliteHandle implements ProjectDbHandle {
  readonly projectId: ProjectUUID;

  constructor(projectId: ProjectUUID, dbPath: string, engineConfig: SqliteEngineConfig) {
    super(dbPath, engineConfig);
    this.projectId = projectId;
  }
}

class SqliteMapDbHandle extends BaseSqliteHandle implements MapDbHandle {
  readonly projectId: ProjectUUID;
  readonly mapId: MapUUID;

  constructor(projectId: ProjectUUID, mapId: MapUUID, dbPath: string, engineConfig: SqliteEngineConfig) {
    super(dbPath, engineConfig);
    this.projectId = projectId;
    this.mapId = mapId;
  }
}

export class SqliteDalContext implements DalContext {
  readonly engine: DbEngine = "sqlite";
  private readonly storagePaths: StoragePaths;
  private readonly engineConfig: SqliteEngineConfig;
  private readonly coreHandle: SqliteCoreDbHandle;
  private readonly projectHandles: Map<ProjectUUID, SqliteProjectDbHandle> = new Map();
  private readonly mapHandles: Map<string, SqliteMapDbHandle> = new Map();

  constructor(storagePaths: StoragePaths, engineConfig: SqliteEngineConfig = {}) {
    this.storagePaths = storagePaths;
    this.engineConfig = engineConfig;

    const corePaths = this.storagePaths.getCorePaths();
    this.coreHandle = new SqliteCoreDbHandle(corePaths.coreDbPath, this.engineConfig);
  }

  getCoreDb(): CoreDbHandle {
    return this.coreHandle;
  }

  getProjectDb(projectId: ProjectUUID): ProjectDbHandle {
    let handle = this.projectHandles.get(projectId);
    if (!handle) {
      const projectPaths = this.storagePaths.getProjectPaths(projectId);
      handle = new SqliteProjectDbHandle(projectId, projectPaths.projectDbPath, this.engineConfig);
      this.projectHandles.set(projectId, handle);
    }
    return handle;
  }

  getMapDb(projectId: ProjectUUID, mapId: MapUUID): MapDbHandle {
    const key = `${projectId}::${mapId}`;
    let handle = this.mapHandles.get(key);
    if (!handle) {
      const mapPaths = this.storagePaths.getMapPaths(projectId, mapId);
      handle = new SqliteMapDbHandle(projectId, mapId, mapPaths.mapDbPath, this.engineConfig);
      this.mapHandles.set(key, handle);
    }
    return handle;
  }
}
