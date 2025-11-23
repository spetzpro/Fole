import { createStoragePaths } from "../../src/core/storage/StoragePaths";
import { InMemoryManifestRepository } from "../../src/core/storage/ManifestRepository";
import { InMemoryLockManager } from "../../src/core/concurrency/LockManager";
import { DefaultAtomicWriteExecutor } from "../../src/core/storage/AtomicWriteExecutor";
import { AtomicWriteService } from "../../src/core/storage/AtomicWriteService";
import { InMemoryAtomicWriteDiagnosticsRepository, RepositoryBackedAtomicWriteDiagnostics } from "../../src/core/storage/AtomicWriteDiagnosticsRepository";

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

async function testAtomicWriteServiceWithDiagnosticsRepository() {
  const storagePaths = createStoragePaths({ storageRoot: "/storage" });
  const manifestRepo = new InMemoryManifestRepository();
  const lockManager = new InMemoryLockManager();

  const diagnosticsRepo = new InMemoryAtomicWriteDiagnosticsRepository(10);
  const diagnostics = new RepositoryBackedAtomicWriteDiagnostics(diagnosticsRepo);

  const executor = new DefaultAtomicWriteExecutor(lockManager, diagnostics);

  const service = new AtomicWriteService({
    storagePaths,
    manifestRepository: manifestRepo,
    executor,
    diagnosticsRepository: diagnosticsRepo,
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
      author: "test-diag",
      targetPath: "/maps/1/tiles/2",
      tmpDir: "/storage/tmp/op2",
      expectedFiles: [],
    },
    hooks,
  );

  const committed = await manifestRepo.listByState("committed");
  assert(committed.length === 1, "one manifest entry must be committed when diagnostics are enabled");

  const recentEvents = diagnosticsRepo.getRecent(10);
  assert(recentEvents.length === 1, "diagnostics repository should contain one event after atomic write");
  const event = recentEvents[0];
  assert(event.targetPath === "/maps/1/tiles/2", "diagnostics event should include correct targetPath");
  assert(event.author === "test-diag", "diagnostics event should include correct author");
  assert(event.status === "success", "diagnostics event status should be success for happy path");
    assert(typeof event.lockAttempts === "number", "lockAttempts is present");
    assert(event.lockAttempts! >= 1, "lockAttempts is at least 1");
    // In the uncontended case we expect lockContended to be false or undefined.
    assert(event.lockContended === false || typeof event.lockContended === "undefined", "lockContended is not true in uncontended case");
}

(async () => {
  await testAtomicWriteServiceHappyPath();
  await testAtomicWriteServiceWithDiagnosticsRepository();
  console.log("atomicWriteService tests passed");
})();
