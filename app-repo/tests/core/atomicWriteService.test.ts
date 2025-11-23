import { createStoragePaths } from "../../src/core/storage/StoragePaths";
import { InMemoryManifestRepository } from "../../src/core/storage/ManifestRepository";
import { InMemoryLockManager } from "../../src/core/concurrency/LockManager";
import { DefaultAtomicWriteExecutor } from "../../src/core/storage/AtomicWriteExecutor";
import { AtomicWriteService } from "../../src/core/storage/AtomicWriteService";

function assert(condition: any, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testAtomicWriteServiceHappyPath() {
  const storagePaths = createStoragePaths({ storageRoot: "/storage" });
  const manifestRepo = new InMemoryManifestRepository();
  const lockManager = new InMemoryLockManager();
  const executor = new DefaultAtomicWriteExecutor(lockManager);

  const service = new AtomicWriteService({
    storagePaths,
    manifestRepository: manifestRepo,
    executor,
  });

  const hooks = {
    async writeFiles() {},
    async fsyncFiles() {},
    async fsyncTmpDir() {},
    async atomicRename() {},
    async fsyncParentDir() {},
  };

  await service.executeAtomicWrite(
    {
      opType: "tile_write",
      author: "test",
      targetPath: "/maps/1/tiles/1",
      tmpDir: "/storage/tmp/op1",
      expectedFiles: [],
    },
    hooks,
  );

  const committed = await manifestRepo.listByState("committed");
  assert(committed.length === 1, "one manifest entry must be committed");
}

(async () => {
  await testAtomicWriteServiceHappyPath();
  console.log("atomicWriteService tests passed");
})();
