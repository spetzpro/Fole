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

class InMemoryDbConnection implements DbConnection {
  readonly engine: DbEngine;

  constructor(engine: DbEngine) {
    this.engine = engine;
  }

  async executeCommand(_command: DbCommand): Promise<DbCommandResult> {
    // In-memory/no-op implementation does not persist anything yet.
    return {};
  }

  async executeQuery<TResult = unknown>(_query: DbQuery): Promise<ReadonlyArray<TResult>> {
    // In-memory/no-op implementation always returns an empty result set.
    return [];
  }
}

abstract class BaseInMemoryHandle {
  protected readonly connection: InMemoryDbConnection;

  protected constructor(engine: DbEngine) {
    this.connection = new InMemoryDbConnection(engine);
  }

  async getConnection(): Promise<DbConnection> {
    return this.connection;
  }

  async runInTransaction<T>(fn: (conn: DbConnection) => Promise<T>, _options?: TransactionOptions): Promise<T> {
    // For in-memory/no-op implementation there is no real transactional behavior.
    // We just invoke the callback with a stable connection instance.
    return fn(this.connection);
  }
}

class InMemoryCoreDbHandle extends BaseInMemoryHandle implements CoreDbHandle {
  constructor(engine: DbEngine) {
    super(engine);
  }
}

class InMemoryProjectDbHandle extends BaseInMemoryHandle implements ProjectDbHandle {
  readonly projectId: ProjectUUID;

  constructor(engine: DbEngine, projectId: ProjectUUID) {
    super(engine);
    this.projectId = projectId;
  }
}

class InMemoryMapDbHandle extends BaseInMemoryHandle implements MapDbHandle {
  readonly projectId: ProjectUUID;
  readonly mapId: MapUUID;

  constructor(engine: DbEngine, projectId: ProjectUUID, mapId: MapUUID) {
    super(engine);
    this.projectId = projectId;
    this.mapId = mapId;
  }
}

export class InMemoryDalContext implements DalContext {
  readonly engine: DbEngine;
  private readonly coreHandle: InMemoryCoreDbHandle;
  private readonly projectHandles: Map<ProjectUUID, InMemoryProjectDbHandle> = new Map();
  private readonly mapHandles: Map<string, InMemoryMapDbHandle> = new Map();

  constructor(engine: DbEngine = "sqlite") {
    this.engine = engine;
    this.coreHandle = new InMemoryCoreDbHandle(engine);
  }

  getCoreDb(): CoreDbHandle {
    return this.coreHandle;
  }

  getProjectDb(projectId: ProjectUUID): ProjectDbHandle {
    let handle = this.projectHandles.get(projectId);
    if (!handle) {
      handle = new InMemoryProjectDbHandle(this.engine, projectId);
      this.projectHandles.set(projectId, handle);
    }
    return handle;
  }

  getMapDb(projectId: ProjectUUID, mapId: MapUUID): MapDbHandle {
    const key = `${projectId}::${mapId}`;
    let handle = this.mapHandles.get(key);
    if (!handle) {
      handle = new InMemoryMapDbHandle(this.engine, projectId, mapId);
      this.mapHandles.set(key, handle);
    }
    return handle;
  }
}
