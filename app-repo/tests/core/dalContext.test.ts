import { InMemoryDalContext } from "../../src/core/db/InMemoryDalContext";
import type { DbConnection } from "../../src/core/db/DalContext";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testInMemoryDalContextBasic() {
  const dalSqlite = new InMemoryDalContext("sqlite");
  const dalPostgres = new InMemoryDalContext("postgres");

  // Core DB connection engines should match context engine.
  const coreConnSqlite: DbConnection = await dalSqlite.getCoreDb().getConnection();
  assert(coreConnSqlite.engine === "sqlite", "Core DB engine should be sqlite");

  const coreConnPostgres: DbConnection = await dalPostgres.getCoreDb().getConnection();
  assert(coreConnPostgres.engine === "postgres", "Core DB engine should be postgres");

  // Project and map handles should be memoized per id combination.
  const projectId: string = "project-123";
  const mapId: string = "map-456";

  const projectHandle1 = dalSqlite.getProjectDb(projectId);
  const projectHandle2 = dalSqlite.getProjectDb(projectId);
  assert(projectHandle1 === projectHandle2, "Project DB handle should be memoized per projectId");

  const mapHandle1 = dalSqlite.getMapDb(projectId, mapId);
  const mapHandle2 = dalSqlite.getMapDb(projectId, mapId);
  assert(mapHandle1 === mapHandle2, "Map DB handle should be memoized per (projectId,mapId)");

  // runInTransaction should call the callback with a stable connection.
  const result = await projectHandle1.runInTransaction(async (conn) => {
    assert(conn.engine === "sqlite", "Transaction connection engine should be sqlite");
    return 42;
  });
  assert(result === 42, "runInTransaction should return callback result");
}

(async () => {
  await testInMemoryDalContextBasic();
})();
