import type { ProjectUUID, MapUUID } from "../storage/StoragePaths";

export type DbEngine = "sqlite" | "postgres";

export type DbCommandType = "insert" | "update" | "delete" | "ddl" | "custom";

export interface DbCommand {
  readonly type: DbCommandType;
  readonly text: string;
  readonly parameters?: ReadonlyArray<unknown>;
}

export interface DbQuery {
  readonly text: string;
  readonly parameters?: ReadonlyArray<unknown>;
}

export interface DbCommandResult {
  readonly rowsAffected?: number;
  readonly raw?: unknown;
}

export interface DbConnection {
  readonly engine: DbEngine;
  executeCommand(command: DbCommand): Promise<DbCommandResult>;
  executeQuery<TResult = unknown>(query: DbQuery): Promise<ReadonlyArray<TResult>>;
}

export interface TransactionOptions {
  readonly readOnly?: boolean;
}

export interface CoreDbHandle {
  getConnection(): Promise<DbConnection>;
  runInTransaction<T>(fn: (conn: DbConnection) => Promise<T>, options?: TransactionOptions): Promise<T>;
}

export interface ProjectDbHandle {
  readonly projectId: ProjectUUID;
  getConnection(): Promise<DbConnection>;
  runInTransaction<T>(fn: (conn: DbConnection) => Promise<T>, options?: TransactionOptions): Promise<T>;
}

export interface MapDbHandle {
  readonly projectId: ProjectUUID;
  readonly mapId: MapUUID;
  getConnection(): Promise<DbConnection>;
  runInTransaction<T>(fn: (conn: DbConnection) => Promise<T>, options?: TransactionOptions): Promise<T>;
}

export interface DalContext {
  readonly engine: DbEngine;
  getCoreDb(): CoreDbHandle;
  getProjectDb(projectId: ProjectUUID): ProjectDbHandle;
  getMapDb(projectId: ProjectUUID, mapId: MapUUID): MapDbHandle;
}
