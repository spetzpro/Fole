import { createStoragePaths, AtomicWriteExecutionPlan } from "../../src/core/storage/StoragePaths";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testAtomicWriteExecutionPlanOrdering() {
  const storage = createStoragePaths({ storageRoot: "/var/fole/STORAGE_ROOT" });

  const targetPath = "/var/fole/STORAGE_ROOT/projects/project-123/files/doc-1.json";
  const tmpDir = "/var/fole/STORAGE_ROOT/projects/project-123/tmp/op-uuid";

  const plan: AtomicWriteExecutionPlan = storage.buildAtomicWriteExecutionPlan({
    opType: "attachment_add",
    author: "tester",
    targetPath,
    tmpDir,
    expectedFiles: [
      {
        relativePath: "doc-1.json",
        sha256: "deadbeef",
      },
    ],
  });

  // Steps should follow the exact sequence defined in _AI_STORAGE_ARCHITECTURE.md Section 6.1.
  const stepOrder = plan.steps.map((s) => s.step);
  const expectedOrder = [
    "acquire_lock",
    "write_files",
    "fsync_files",
    "fsync_tmp_dir",
    "atomic_rename",
    "fsync_parent_dir",
    "update_manifest",
    "commit_tx",
    "release_lock",
  ] as const;

  assert(stepOrder.length === expectedOrder.length, "Execution plan should contain all required steps");

  expectedOrder.forEach((step, index) => {
    assert(stepOrder[index] === step, `Step ${index} should be ${step} but was ${stepOrder[index]}`);
  });

  // Sanity check: execution plan should preserve manifest + tmpDir/finalParentDir from base plan.
  assert(plan.manifest.targetPath === targetPath, "Manifest targetPath should match input");
  assert(plan.tmpDir === tmpDir, "tmpDir should match input");
}

(async () => {
  await testAtomicWriteExecutionPlanOrdering();
})();
