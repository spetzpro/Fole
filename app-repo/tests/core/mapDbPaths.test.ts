import { CoreRuntime } from "../../src/core/CoreRuntime";
import { MapDb } from "../../src/core/MapDb";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testMapDbPathMatchesSpecLayoutAndOpensConnection() {
  const runtime = new CoreRuntime({
    storageRoot: "/storage-map-db",
    useInMemoryDal: true,
    lockDiagnosticsRepositoryCapacity: 10,
  });

  const projectId = "proj-map-db-path-contract";
  const mapId = "map-db-path-contract";
  const mapDb = new MapDb(runtime);

  const paths = mapDb.getMapDbPath(projectId, mapId);

  assert(paths.projectId === projectId, "projectId must round-trip in MapDbPaths");
  assert(paths.mapId === mapId, "mapId must round-trip in MapDbPaths");
  assert(
    paths.dbPath === `/projects/${projectId}/maps/${mapId}/map.db`,
    "map.db path must match STORAGE_ROOT/projects/<projectId>/maps/<mapId>/map.db",
  );

  const conn = await mapDb.getConnection(projectId, mapId);
  assert(conn.engine === "sqlite", "in-memory DAL must expose sqlite engine for map DB");
}

(async () => {
  await testMapDbPathMatchesSpecLayoutAndOpensConnection();
})();
