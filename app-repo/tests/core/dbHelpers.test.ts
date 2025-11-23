import { InMemoryDalContext } from "../../src/core/db/InMemoryDalContext";
import { executeReadMany, executeReadOne, executeWrite } from "../../src/core/db/DbHelpers";
import type { DbConnection } from "../../src/core/db/DalContext";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testDbHelpersWithInMemoryDal() {
  const dal = new InMemoryDalContext("sqlite");
  const coreConn: DbConnection = await dal.getCoreDb().getConnection();

  const writeResult = await executeWrite(coreConn, "NOOP");
  assert(typeof writeResult === "object", "executeWrite should return an object result");

  const one = await executeReadOne(coreConn, "SELECT 1");
  assert(one === undefined, "executeReadOne should resolve to undefined for no results");

  const many = await executeReadMany(coreConn, "SELECT 1");
  assert(Array.isArray(many) && many.length === 0, "executeReadMany should resolve to an empty array");
}

(async () => {
  await testDbHelpersWithInMemoryDal();
})();
