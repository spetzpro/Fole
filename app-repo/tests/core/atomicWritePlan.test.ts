import { createStoragePaths, type AtomicWritePlanInput, type ExpectedFile } from "../../src/core/storage/StoragePaths";

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

(function run() {
  const storageRoot = "/var/fole/STORAGE_ROOT";
  const paths = createStoragePaths({ storageRoot });

  const targetPath = "/var/fole/STORAGE_ROOT/projects/project-123/files/doc-1.json";
  const tmpDir = "/var/fole/STORAGE_ROOT/projects/project-123/tmp/op-uuid";
  const expectedFiles: ExpectedFile[] = [
    { relativePath: "doc-1.json", sha256: "abc123" },
  ];

  const input: AtomicWritePlanInput = {
    opType: "attachment_add",
    author: "test-agent",
    targetPath,
    tmpDir,
    expectedFiles,
  };

  const plan = paths.buildAtomicWritePlan(input);

  assertEqual(plan.manifest.opType, "attachment_add", "op_type");
  assertEqual(plan.manifest.targetPath, targetPath, "target_path");
  assertEqual(plan.manifest.tmpPath, tmpDir, "tmp_path");
  assertEqual(plan.manifest.state, "pending", "initial state");
  assertEqual(plan.manifest.author, "test-agent", "author");
  assertEqual(plan.tmpDir, tmpDir, "plan tmpDir");
  assertEqual(plan.finalParentDir, "/var/fole/STORAGE_ROOT/projects/project-123/files", "final parent dir");

  if (!Array.isArray(plan.manifest.expectedFiles) || plan.manifest.expectedFiles.length !== 1) {
    throw new Error("expectedFiles length");
  }
})();
