import { CoreRuntime } from "../../src/core/CoreRuntime";
import { InMemoryDalContext } from "../../src/core/db/InMemoryDalContext";
import { SqliteDalContext } from "../../src/core/db/SqliteDalContext";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

(async function run() {
  // In-memory DAL configuration must never use DalLockManager.
  const rtInMemory = new CoreRuntime({
    storageRoot: "/tmp/fole-core-runtime-wiring",
    useInMemoryDal: true,
    useDalLocks: true,
  });

  assert(rtInMemory.dal instanceof InMemoryDalContext, "in-memory runtime uses InMemoryDalContext");

  // Real DAL (SQLite) configuration may use DalLockManager.
  const rtSqlite = new CoreRuntime({
    storageRoot: "/tmp/fole-core-runtime-wiring-sqlite",
    useInMemoryDal: false,
    useDalLocks: true,
  });

  assert(rtSqlite.dal instanceof SqliteDalContext, "sqlite runtime uses SqliteDalContext");
})();
