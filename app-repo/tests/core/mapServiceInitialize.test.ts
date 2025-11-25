import { CoreRuntime } from "../../src/core/CoreRuntime";
import type { DbConnection } from "../../src/core/db/DalContext";
import { InMemoryDalContext } from "../../src/core/db/InMemoryDalContext";
import { MapService } from "../../src/core/MapService";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

class RecordingConnection implements DbConnection {
  readonly engine = "sqlite" as const;
  public readonly executed: { type?: string; text: string; parameters?: ReadonlyArray<unknown> }[] = [];

  async executeCommand(command: { type: string; text: string; parameters?: ReadonlyArray<unknown> }) {
    this.executed.push({ type: command.type, text: command.text, parameters: command.parameters });
    return {};
  }

  async executeQuery<TResult = unknown>(query: { text: string; parameters?: ReadonlyArray<unknown> }) {
    this.executed.push({ text: query.text, parameters: query.parameters });
    return [] as TResult[];
  }
}

async function testInitializeMapRunsSnapshotAndInitialSettings() {
  const runtime = new CoreRuntime({
    storageRoot: "/storage-map-service-init",
    useInMemoryDal: true,
    lockDiagnosticsRepositoryCapacity: 50,
  });

  const projectId = "proj-map-service-init";
  const mapId = "map-service-init";

  const dal = runtime.dal as InMemoryDalContext;
  const mapHandle: any = dal.getMapDb(projectId, mapId);
  const recordingConn = new RecordingConnection();
  mapHandle.getConnection = async (): Promise<DbConnection> => recordingConn;

  const service = new MapService(runtime);

  await service.initializeMap({
    projectId,
    mapId,
    author: "tester",
    initialSettings: {
      theme: { mode: "dark" },
    },
  });

  const committedEntries = await runtime.manifestRepository.listByState("committed");
  assert(committedEntries.length === 1, "initializeMap must commit exactly one map snapshot entry");

  const [snapshotEntry] = committedEntries;
  assert(
    snapshotEntry.opType === "map_snapshot_write",
    "initializeMap must perform a map_snapshot_write operation",
  );
  assert(
    snapshotEntry.targetPath === `/projects/${projectId}/maps/${mapId}/snapshot.json`,
    "map snapshot targetPath must match the canonical map snapshot path",
  );

  assert(
    recordingConn.executed.length === 1,
    "initializeMap with one initial setting must perform exactly one map settings upsert",
  );

  const [upsertOp] = recordingConn.executed;
  assert(upsertOp.text.startsWith("INSERT INTO map_settings"), "must insert into map_settings");
  assert(
    upsertOp.text.includes("ON CONFLICT(project_id, map_id, key) DO UPDATE"),
    "must use ON CONFLICT(project_id, map_id, key) DO UPDATE",
  );
  assert(
    JSON.stringify(upsertOp.parameters) ===
      JSON.stringify([projectId, mapId, "theme", { mode: "dark" }]),
    "upsert parameters must be [projectId, mapId, key, valueJson]",
  );
}

(async () => {
  await testInitializeMapRunsSnapshotAndInitialSettings();
})();
