import { CoreRuntime } from "../../src/core/CoreRuntime";

function assert(condition: any, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testCoreRuntimeAtomicWriteWithDalLocks() {
  const runtime = new CoreRuntime({
    storageRoot: "/storage",
    useInMemoryDal: true,
    useDalLocks: true,
  });

  const hooks = {
    async writeFiles() {},
    async fsyncFiles() {},
    async fsyncTmpDir() {},
    async atomicRename() {},
    async fsyncParentDir() {},
  };

  await runtime.atomicWriteService.executeAtomicWrite(
    {
      opType: "tile_write",
      author: "runtime-test",
      targetPath: "/maps/1/tiles/runtime",
      tmpDir: "/storage/tmp/runtime-op",
      expectedFiles: [],
    },
    hooks,
  );

  const committed = await runtime.manifestRepository.listByState("committed");
  assert(committed.length === 1, "CoreRuntime should commit one manifest entry via atomic write");
}

(async () => {
  await testCoreRuntimeAtomicWriteWithDalLocks();
  console.log("coreRuntime tests passed");
})();
