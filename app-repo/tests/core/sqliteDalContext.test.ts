import { createStoragePaths } from "../../src/core/storage/StoragePaths";
import { SqliteDalContext } from "../../src/core/db/SqliteDalContext";
import type { DbConnection } from "../../src/core/db/DalContext";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testSqliteDalContextWiring() {
  const storage = createStoragePaths({ storageRoot: "/var/fole/STORAGE_ROOT" });
  const dal = new SqliteDalContext(storage, {});

  const coreConn: DbConnection = await dal.getCoreDb().getConnection();
  assert(coreConn.engine === "sqlite", "Core connection engine should be sqlite");

  const projectId = "project-111";
  const mapId = "map-222";

  const projectHandle1 = dal.getProjectDb(projectId);
  const projectHandle2 = dal.getProjectDb(projectId);
  assert(projectHandle1 === projectHandle2, "Sqlite project handle should be memoized per projectId");

  const mapHandle1 = dal.getMapDb(projectId, mapId);
  const mapHandle2 = dal.getMapDb(projectId, mapId);
  assert(mapHandle1 === mapHandle2, "Sqlite map handle should be memoized per (projectId,mapId)");

  const result = await projectHandle1.runInTransaction(async (conn) => {
    assert(conn.engine === "sqlite", "Transaction connection engine should be sqlite");
    return 7;
  });
  assert(result === 7, "Sqlite runInTransaction should return callback result");
}

(async () => {
  await testSqliteDalContextWiring();
})();
