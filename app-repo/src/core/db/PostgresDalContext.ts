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

export interface PostgresDbConnection extends DbConnection {
  readonly engine: "postgres";
  readonly schema: string;
  /** Placeholder for future pg Pool/Client handle. */
  readonly raw: unknown;
}

export interface PostgresEngineConfig {
  readonly connectionString?: string;
}

class PostgresConnectionImpl implements PostgresDbConnection {
  readonly engine: "postgres" = "postgres";
  readonly schema: string;
  readonly raw: unknown = null;

  constructor(schema: string) {
    this.schema = schema;
  }

  async executeCommand(_command: DbCommand): Promise<DbCommandResult> {
    // Placeholder for future postgres command execution.
    return {};
  }

  async executeQuery<TResult = unknown>(_query: DbQuery): Promise<ReadonlyArray<TResult>> {
    // Placeholder for future postgres query execution.
    return [];
  }
}

abstract class BasePostgresHandle {
  protected readonly schema: string;
  protected readonly engineConfig: PostgresEngineConfig;

  protected constructor(schema: string, engineConfig: PostgresEngineConfig) {
    this.schema = schema;
    this.engineConfig = engineConfig;
  }

  async getConnection(): Promise<PostgresDbConnection> {
    // Future: fetch/create pg client bound to this.schema.
    return new PostgresConnectionImpl(this.schema);
  }

  async runInTransaction<T>(fn: (conn: DbConnection) => Promise<T>, _options?: TransactionOptions): Promise<T> {
    const conn = await this.getConnection();
    // Future: BEGIN/COMMIT/ROLLBACK around callback.
    return fn(conn);
  }
}

class PostgresCoreDbHandle extends BasePostgresHandle implements CoreDbHandle {
  constructor(schema: string, engineConfig: PostgresEngineConfig) {
    super(schema, engineConfig);
  }
}

class PostgresProjectDbHandle extends BasePostgresHandle implements ProjectDbHandle {
  readonly projectId: ProjectUUID;

  constructor(projectId: ProjectUUID, schema: string, engineConfig: PostgresEngineConfig) {
    super(schema, engineConfig);
    this.projectId = projectId;
  }
}

class PostgresMapDbHandle extends BasePostgresHandle implements MapDbHandle {
  readonly projectId: ProjectUUID;
  readonly mapId: MapUUID;

  constructor(projectId: ProjectUUID, mapId: MapUUID, schema: string, engineConfig: PostgresEngineConfig) {
    super(schema, engineConfig);
    this.projectId = projectId;
    this.mapId = mapId;
  }
}

function projectSchema(projectId: ProjectUUID): string {
  return `fole_project_${projectId}`;
}

function mapSchema(projectId: ProjectUUID, mapId: MapUUID): string {
  return `fole_project_${projectId}_map_${mapId}`;
}

export class PostgresDalContext implements DalContext {
  readonly engine: DbEngine = "postgres";
  private readonly engineConfig: PostgresEngineConfig;
  private readonly coreHandle: PostgresCoreDbHandle;
  private readonly projectHandles: Map<ProjectUUID, PostgresProjectDbHandle> = new Map();
  private readonly mapHandles: Map<string, PostgresMapDbHandle> = new Map();

  constructor(engineConfig: PostgresEngineConfig = {}) {
    this.engineConfig = engineConfig;
    this.coreHandle = new PostgresCoreDbHandle("fole_core", this.engineConfig);
  }

  getCoreDb(): CoreDbHandle {
    return this.coreHandle;
  }

  getProjectDb(projectId: ProjectUUID): ProjectDbHandle {
    let handle = this.projectHandles.get(projectId);
    if (!handle) {
      const schema = projectSchema(projectId);
      handle = new PostgresProjectDbHandle(projectId, schema, this.engineConfig);
      this.projectHandles.set(projectId, handle);
    }
    return handle;
  }

  getMapDb(projectId: ProjectUUID, mapId: MapUUID): MapDbHandle {
    const key = `${projectId}::${mapId}`;
    let handle = this.mapHandles.get(key);
    if (!handle) {
      const schema = mapSchema(projectId, mapId);
      handle = new PostgresMapDbHandle(projectId, mapId, schema, this.engineConfig);
      this.mapHandles.set(key, handle);
    }
    return handle;
  }
}
