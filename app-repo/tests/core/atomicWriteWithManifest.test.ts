import { DefaultAtomicWriteExecutor } from "../../src/core/storage/AtomicWriteExecutor";
import { InMemoryLockManager } from "../../src/core/concurrency/LockManager";
import { InMemoryManifestRepository } from "../../src/core/storage/ManifestRepository";
import { AtomicWriteExecutionPlan, AtomicWritePlanInput, ExpectedFile } from "../../src/core/storage/StoragePaths";

function assert(condition: any, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function buildFakeExecutionPlan(input: AtomicWritePlanInput): AtomicWriteExecutionPlan {
  const expectedFiles: ExpectedFile[] = input.expectedFiles;
  return {
    manifest: {
      opType: input.opType,
      targetPath: input.targetPath,
      tmpPath: input.tmpDir,
      expectedFiles,
      createdAt: new Date().toISOString(),
      state: "pending",
      author: input.author,
    },
    tmpDir: input.tmpDir,
    finalParentDir: "/final",
    steps: [
      { step: "acquire_lock", description: "acquire lock" },
      { step: "write_files", description: "write files" },
      { step: "fsync_files", description: "fsync files" },
      { step: "fsync_tmp_dir", description: "fsync tmp" },
      { step: "atomic_rename", description: "rename" },
      { step: "fsync_parent_dir", description: "fsync parent" },
      { step: "update_manifest", description: "update manifest" },
      { step: "commit_tx", description: "commit" },
      { step: "release_lock", description: "release" },
    ],
  };
}

async function testAtomicWriteWithManifestRepository() {
  const lockManager = new InMemoryLockManager();
  const executor = new DefaultAtomicWriteExecutor(lockManager);
  const manifestRepo = new InMemoryManifestRepository();

  const input: AtomicWritePlanInput = {
    opType: "tile_write",
    author: "test",
    targetPath: "/maps/1/tiles/1",
    tmpDir: "/tmp/1",
    expectedFiles: [],
  };

  // Pre-create a pending manifest row using the repository, simulating planner behavior.
  const manifestRow = await manifestRepo.createPending({
    opType: input.opType,
    targetPath: input.targetPath,
    tmpPath: input.tmpDir,
    expectedFiles: input.expectedFiles,
    author: input.author,
  });

  const plan: AtomicWriteExecutionPlan = {
    ...buildFakeExecutionPlan(input),
    manifest: manifestRow,
  };

  const hooks = {
    async writeFiles() {},
    async fsyncFiles() {},
    async fsyncTmpDir() {},
    async atomicRename() {},
    async fsyncParentDir() {},
    async updateManifest(p: AtomicWriteExecutionPlan) {
      // In a real implementation, this would update additional manifest fields
      // inside a DB transaction. Here we simply ensure the row exists.
      const existing = await manifestRepo.getById(p.manifest.id!);
      assert(existing !== undefined, "manifest row must exist before commit");
    },
    async commitTransaction(p: AtomicWriteExecutionPlan) {
      const committedAt = new Date().toISOString();
      const updated = await manifestRepo.markCommitted(p.manifest.id!, 1, committedAt);
      assert(updated?.state === "committed", "manifest state must be committed after commitTransaction");
    },
  };

  const result = await executor.execute(plan, hooks);

  assert(result.stepsExecuted.includes("acquire_lock"), "lock must be acquired");
  assert(result.stepsExecuted.includes("update_manifest"), "update_manifest must run");
  assert(result.stepsExecuted.includes("commit_tx"), "commit_tx must run");
  assert(result.stepsExecuted.includes("release_lock"), "lock must be released");

  const finalManifest = await manifestRepo.getById(manifestRow.id!);
  assert(finalManifest?.state === "committed", "final manifest state must be committed");
}

(async () => {
  await testAtomicWriteWithManifestRepository();
  console.log("atomicWriteWithManifest tests passed");
})();
