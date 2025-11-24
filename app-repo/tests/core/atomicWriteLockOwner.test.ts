import { createStoragePaths, type AtomicWritePlanInput } from "../../src/core/storage/StoragePaths";
import { DefaultAtomicWriteExecutor } from "../../src/core/storage/AtomicWriteExecutor";
import { InMemoryLockManager } from "../../src/core/concurrency/LockManager";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testAtomicWriteExecutorUsesStableOwnerId() {
  const storagePaths = createStoragePaths({ storageRoot: "/tmp/fole" });
  const planInput: AtomicWritePlanInput = {
    opType: "owner_stability_op",
    author: "owner-test-author",
    targetPath: "/tmp/fole/projects/p-owner/metadata.json",
    tmpDir: "/tmp/fole/projects/p-owner/tmp/op-owner",
    expectedFiles: [],
  };

  const execPlan = storagePaths.buildAtomicWriteExecutionPlan(planInput);

  // The StoragePaths implementation should have populated a lockOwnerId.
  assert(
    execPlan.manifest.lockOwnerId === planInput.author,
    "lockOwnerId should default to author in manifest",
  );

  const lockManager = new InMemoryLockManager();
  const executor = new DefaultAtomicWriteExecutor(lockManager);

  let wrote = false;
  const hooks = {
    async writeFiles() {
      wrote = true;
    },
    async fsyncFiles() {},
    async fsyncTmpDir() {},
    async atomicRename() {},
    async fsyncParentDir() {},
    async updateManifest() {},
    async commitTransaction() {},
  };

  await executor.execute(execPlan, hooks);

  assert(wrote, "executor should call writeFiles");
}

(async () => {
  await testAtomicWriteExecutorUsesStableOwnerId();
})();
