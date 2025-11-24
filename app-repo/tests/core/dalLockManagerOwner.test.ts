import { SqliteDalContext } from "../../src/core/db/SqliteDalContext";
import { DalLockManager } from "../../src/core/concurrency/LockManager";
import { createStoragePaths } from "../../src/core/storage/StoragePaths";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testDalLockManagerOwnerMismatch() {
  const storageRoot = "/tmp/fole-test-storage";
  const storagePaths = createStoragePaths({ storageRoot });
  const dal = new SqliteDalContext(storagePaths);

  const manager = new DalLockManager({
    dal,
    tableName: "dal_locks_test_owner_mismatch",
  });

  const lockId = { id: "atomic:/test-owner-lock-mismatch" };
  const owner = { ownerId: "owner-1" };

  const acquired = await manager.acquire(lockId, owner, "write");

  // Intentionally change ownerId to violate the contract
  const wrongOwnerLock = { ...acquired, ownerId: "different-owner" };

  let threw = false;
  try {
    await manager.release(wrongOwnerLock);
  } catch (err) {
    threw = true;
    assert(
      err instanceof Error &&
        err.message.includes("cannot release lock not held by owner"),
      "release with different ownerId should fail with the expected error",
    );
  }

  assert(threw, "release with mismatched ownerId should throw");
}

(async () => {
  await testDalLockManagerOwnerMismatch();
})();
