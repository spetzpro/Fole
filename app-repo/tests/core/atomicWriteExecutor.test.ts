import { createStoragePaths, type AtomicWritePlanInput } from "../../src/core/storage/StoragePaths";
import { DefaultAtomicWriteExecutor, type AtomicWriteDiagnostics, type AtomicWriteDiagnosticsEvent } from "../../src/core/storage/AtomicWriteExecutor";
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

async function testAtomicWriteExecutorDiagnosticsSuccess() {
  const storagePaths = createStoragePaths({ storageRoot: "/tmp/fole" });
  const planInput: AtomicWritePlanInput = {
    opType: "example_op",
    author: "diag-author",
    targetPath: "/tmp/fole/projects/p1/maps/m1/final-diag-success",
    tmpDir: "/tmp/fole/projects/p1/maps/m1/tmp/op-456",
    expectedFiles: [],
  };
  const execPlan = storagePaths.buildAtomicWriteExecutionPlan(planInput);

  const lockManager = new InMemoryLockManager();
  const events: AtomicWriteDiagnosticsEvent[] = [];

  const diagnostics: AtomicWriteDiagnostics = {
    onAtomicWriteComplete(event: AtomicWriteDiagnosticsEvent): void {
      events.push(event);
    },
  };

  const executor = new DefaultAtomicWriteExecutor(lockManager, diagnostics);
  const hooks = new RecordingHooks();

  const result = await executor.execute(execPlan, hooks);

  assert(events.length === 1, "Diagnostics should receive exactly one event on success");
  const event = events[0];

  assert(event.status === "success", "Diagnostics event status should be success");
  assert(event.errorMessage === undefined, "Diagnostics event should not have errorMessage on success");
  assert(event.targetPath === planInput.targetPath, "Diagnostics event should include targetPath");
  assert(event.author === planInput.author, "Diagnostics event should include author");
  assert(event.stepsExecuted.length === result.stepsExecuted.length, "Diagnostics event should include all executed steps");
  assert(event.finishedAt >= event.startedAt, "finishedAt should be >= startedAt");
  assert(event.durationMs >= 0, "durationMs should be non-negative");
}

class FailingHooks extends RecordingHooks {
  override async commitTransaction(): Promise<void> {
    this.calls.push("commit_tx");
    throw new Error("commit failed for diagnostics test");
  }
}

async function testAtomicWriteExecutorDiagnosticsFailure() {
  const storagePaths = createStoragePaths({ storageRoot: "/tmp/fole" });
  const planInput: AtomicWritePlanInput = {
    opType: "example_op",
    author: "diag-author-fail",
    targetPath: "/tmp/fole/projects/p1/maps/m1/final-diag-failure",
    tmpDir: "/tmp/fole/projects/p1/maps/m1/tmp/op-789",
    expectedFiles: [],
  };
  const execPlan = storagePaths.buildAtomicWriteExecutionPlan(planInput);

  const lockManager = new InMemoryLockManager();
  const events: AtomicWriteDiagnosticsEvent[] = [];

  const diagnostics: AtomicWriteDiagnostics = {
    onAtomicWriteComplete(event: AtomicWriteDiagnosticsEvent): void {
      events.push(event);
    },
  };

  const executor = new DefaultAtomicWriteExecutor(lockManager, diagnostics);
  const hooks = new FailingHooks();

  let threw = false;
  try {
    await executor.execute(execPlan, hooks);
  } catch (err) {
    threw = true;
    assert(err instanceof Error, "Error should be an instance of Error");
  }

  assert(threw, "Executor should throw when hooks fail");

  assert(events.length === 1, "Diagnostics should receive exactly one event on failure");
  const event = events[0];

  assert(event.status === "failure", "Diagnostics event status should be failure");
  assert(typeof event.errorMessage === "string" && event.errorMessage.length > 0, "Diagnostics event should include errorMessage on failure");
  assert(event.targetPath === planInput.targetPath, "Diagnostics event should include targetPath on failure");
  assert(event.author === planInput.author, "Diagnostics event should include author on failure");
  assert(event.stepsExecuted.includes("release_lock"), "Diagnostics event should record release_lock step even on failure");
  assert(event.finishedAt >= event.startedAt, "finishedAt should be >= startedAt on failure");
  assert(event.durationMs >= 0, "durationMs should be non-negative on failure");
}

(async () => {
  await testAtomicWriteExecutorOrdering();
  await testAtomicWriteExecutorDiagnosticsSuccess();
  await testAtomicWriteExecutorDiagnosticsFailure();
})();
