import { InMemoryDalContext } from "../../src/core/db/InMemoryDalContext";
import type { DbConnection } from "../../src/core/db/DalContext";
import { CoreRuntime } from "../../src/core/CoreRuntime";
import { MapDb } from "../../src/core/MapDb";
import { MapLocalSettingsRepository } from "../../src/core/MapLocalSettingsRepository";

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

async function testMapLocalSettingsRepositoryUsesMapDbAndHelpers() {
  const storageRoot = "/storage-map-local-settings";
  const runtime = new CoreRuntime({
    storageRoot,
    useInMemoryDal: true,
    lockDiagnosticsRepositoryCapacity: 10,
  });

  const projectId = "proj-map-local-settings";
  const mapId = "map-local-settings";

  const dal = runtime.dal as InMemoryDalContext;
  const mapHandle: any = dal.getMapDb(projectId, mapId);
  const recordingConn = new RecordingConnection();
  mapHandle.getConnection = async (): Promise<DbConnection> => recordingConn;

  const mapDb = new MapDb(runtime);
  const repo = new MapLocalSettingsRepository(mapDb);

  await repo.getSetting(projectId, mapId, "theme");
  await repo.upsertSetting(projectId, mapId, "theme", { mode: "dark" });

  assert(recordingConn.executed.length === 2, "expected two DAL operations (read + upsert) for map settings");

  const [selectOp, upsertOp] = recordingConn.executed;

  assert(
    selectOp.text.includes(
      "FROM map_settings WHERE project_id = ? AND map_id = ? AND key = ?",
    ),
    "getSetting must select from map_settings with project_id, map_id, and key",
  );
  assert(
    JSON.stringify(selectOp.parameters) === JSON.stringify([projectId, mapId, "theme"]),
    "getSetting must bind projectId, mapId, and key parameters",
  );

  assert(upsertOp.text.startsWith("INSERT INTO map_settings"), "upsertSetting must insert into map_settings");
  assert(
    upsertOp.text.includes("ON CONFLICT(project_id, map_id, key) DO UPDATE"),
    "upsertSetting must use ON CONFLICT(project_id, map_id, key) DO UPDATE",
  );
  assert(
    JSON.stringify(upsertOp.parameters) ===
      JSON.stringify([projectId, mapId, "theme", { mode: "dark" }]),
    "upsertSetting must bind projectId, mapId, key, and valueJson parameters",
  );
}

(async () => {
  await testMapLocalSettingsRepositoryUsesMapDbAndHelpers();
})();
