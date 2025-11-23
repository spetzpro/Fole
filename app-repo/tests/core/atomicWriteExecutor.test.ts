import { createStoragePaths, type AtomicWritePlanInput } from "../../src/core/storage/StoragePaths";
import { DefaultAtomicWriteExecutor } from "../../src/core/storage/AtomicWriteExecutor";
import { InMemoryLockManager } from "../../src/core/concurrency/LockManager";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

class RecordingHooks {
  public calls: string[] = [];

  async writeFiles(): Promise<void> {
    this.calls.push("write_files");
  }

  async fsyncFiles(): Promise<void> {
    this.calls.push("fsync_files");
  }

  async fsyncTmpDir(): Promise<void> {
    this.calls.push("fsync_tmp_dir");
  }

  async atomicRename(): Promise<void> {
    this.calls.push("atomic_rename");
  }

  async fsyncParentDir(): Promise<void> {
    this.calls.push("fsync_parent_dir");
  }

  async updateManifest(): Promise<void> {
    this.calls.push("update_manifest");
  }

  async commitTransaction(): Promise<void> {
    this.calls.push("commit_tx");
  }
}

async function testAtomicWriteExecutorOrdering() {
  const storagePaths = createStoragePaths({ storageRoot: "/tmp/fole" });
  const planInput: AtomicWritePlanInput = {
    opType: "example_op",
    author: "test-author",
    targetPath: "/tmp/fole/projects/p1/maps/m1/final",
    tmpDir: "/tmp/fole/projects/p1/maps/m1/tmp/op-123",
    expectedFiles: [],
  };
  const execPlan = storagePaths.buildAtomicWriteExecutionPlan(planInput);

  const lockManager = new InMemoryLockManager();
  const executor = new DefaultAtomicWriteExecutor(lockManager);
  const hooks = new RecordingHooks();

  const result = await executor.execute(execPlan, hooks);

  // stepsExecuted should mirror the spec-defined order, including lock acquire/release.
  assert(
    JSON.stringify(result.stepsExecuted) ===
      JSON.stringify([
        "acquire_lock",
        "write_files",
        "fsync_files",
        "fsync_tmp_dir",
        "atomic_rename",
        "fsync_parent_dir",
        "update_manifest",
        "commit_tx",
        "release_lock",
      ]),
    "stepsExecuted should follow the atomic write sequence with lock management"
  );

  // Hooks should have been called in the same order, minus lock steps.
  assert(
    JSON.stringify(hooks.calls) ===
      JSON.stringify([
        "write_files",
        "fsync_files",
        "fsync_tmp_dir",
        "atomic_rename",
        "fsync_parent_dir",
        "update_manifest",
        "commit_tx",
      ]),
    "Hooks should be invoked in the correct order"
  );
}

(async () => {
  await testAtomicWriteExecutorOrdering();
})();
