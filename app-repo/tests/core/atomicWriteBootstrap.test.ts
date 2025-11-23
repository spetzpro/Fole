import { createStoragePaths } from "../../src/core/storage/StoragePaths";
import { InMemoryManifestRepository } from "../../src/core/storage/ManifestRepository";
import { InMemoryDalContext } from "../../src/core/db/InMemoryDalContext";
import { createAtomicWriteService } from "../../src/core/storage/AtomicWriteBootstrap";

function assert(condition: any, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testAtomicWriteServiceWithDalBackedLockManager() {
  const storagePaths = createStoragePaths({ storageRoot: "/storage" });
  const manifestRepo = new InMemoryManifestRepository();
  const dal = new InMemoryDalContext();

  const service = createAtomicWriteService({
    storagePaths,
    manifestRepository: manifestRepo,
    dalContext: dal,
    options: {
      lockManager: {
        useDal: true,
      },
    },
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
      author: "test-dal-lock",
      targetPath: "/maps/1/tiles/bootstrap",
      tmpDir: "/storage/tmp/op-bootstrap",
      expectedFiles: [],
    },
    hooks,
  );

  const committed = await manifestRepo.listByState("committed");
  assert(committed.length === 1, "one manifest entry must be committed when using DAL-backed lock manager");
}

(async () => {
  await testAtomicWriteServiceWithDalBackedLockManager();
  console.log("atomicWriteBootstrap tests passed");
})();
