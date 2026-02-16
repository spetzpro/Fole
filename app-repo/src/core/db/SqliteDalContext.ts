import type { ProjectUUID, MapUUID } from "../storage/StoragePaths";
import type {
  CoreDbHandle,
  DalContext,
  DbCommand,
  DbCommandResult,
  DbConnection,
  DbEngine,
  DbQuery,
  MapDbHandle,
  ProjectDbHandle,
  TransactionOptions,
} from "./DalContext";
import type { StoragePaths } from "../storage/StoragePaths";
import sqlite3 from "sqlite3";
import * as fs from "fs";
import * as path from "path";

export interface SqliteDbConnection extends DbConnection {
  readonly engine: "sqlite";
  readonly dbFilePath: string;
  readonly raw: sqlite3.Database;
}

interface SqliteEngineConfig {
  readonly flags?: string[];
}

class SqliteConnectionImpl implements SqliteDbConnection {
  readonly engine: "sqlite" = "sqlite";
  readonly dbFilePath: string;
  readonly raw: sqlite3.Database;

  constructor(dbFilePath: string) {
    this.dbFilePath = dbFilePath;
    fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });
    this.raw = new sqlite3.Database(
      dbFilePath,
      sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
    );
  }

  private run(sql: string, parameters: ReadonlyArray<unknown>): Promise<DbCommandResult> {
    return new Promise((resolve, reject) => {
      this.raw.run(sql, parameters as any[], function (this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          reject(err);
          return;
        }

        resolve({
          rowsAffected: typeof this.changes === "number" ? this.changes : undefined,
          raw: this,
        });
      });
    });
  }

  private all<TResult>(sql: string, parameters: ReadonlyArray<unknown>): Promise<ReadonlyArray<TResult>> {
    return new Promise((resolve, reject) => {
      this.raw.all(sql, parameters as any[], (err: Error | null, rows: TResult[]) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows || []);
      });
    });
  }

  async executeCommand(command: DbCommand): Promise<DbCommandResult> {
    return this.run(command.text, command.parameters || []);
  }

  async executeQuery<TResult = unknown>(query: DbQuery): Promise<ReadonlyArray<TResult>> {
    return this.all<TResult>(query.text, query.parameters || []);
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
    await conn.executeCommand({ type: "custom", text: "BEGIN" });
    try {
      const result = await fn(conn);
      await conn.executeCommand({ type: "custom", text: "COMMIT" });
      return result;
    } catch (error) {
      await conn.executeCommand({ type: "custom", text: "ROLLBACK" });
      throw error;
    }
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
