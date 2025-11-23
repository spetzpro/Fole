import { PostgresDalContext } from "../../src/core/db/PostgresDalContext";
import type { DbConnection } from "../../src/core/db/DalContext";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testPostgresDalContextWiring() {
  const dal = new PostgresDalContext({});

  const coreConn: DbConnection = await dal.getCoreDb().getConnection();
  assert(coreConn.engine === "postgres", "Core connection engine should be postgres");

  const projectId = "project-abc";
  const mapId = "map-def";

  const projectHandle1 = dal.getProjectDb(projectId);
  const projectHandle2 = dal.getProjectDb(projectId);
  assert(projectHandle1 === projectHandle2, "Postgres project handle should be memoized per projectId");

  const mapHandle1 = dal.getMapDb(projectId, mapId);
  const mapHandle2 = dal.getMapDb(projectId, mapId);
  assert(mapHandle1 === mapHandle2, "Postgres map handle should be memoized per (projectId,mapId)");

  const connFromProject: DbConnection = await projectHandle1.getConnection();
  assert(connFromProject.engine === "postgres", "Project connection engine should be postgres");

  const result = await mapHandle1.runInTransaction(async (conn) => {
    assert(conn.engine === "postgres", "Transaction connection engine should be postgres");
    return 9;
  });
  assert(result === 9, "Postgres runInTransaction should return callback result");
}

(async () => {
  await testPostgresDalContextWiring();
})();
