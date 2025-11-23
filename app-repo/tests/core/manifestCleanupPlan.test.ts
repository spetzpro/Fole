import { createStoragePaths, ManifestCleanupPlan, TmpDirectoryInfo } from "../../src/core/storage/StoragePaths";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testManifestCleanupPlanRespectsPendingAndAgeWindow() {
  const storage = createStoragePaths({ storageRoot: "/var/fole/STORAGE_ROOT" });

  const nowIso = "2025-01-01T12:00:00.000Z";
  const safetyWindowMs = 60 * 60 * 1000; // 1 hour

  const tmpDirs: TmpDirectoryInfo[] = [
    {
      path: "/var/fole/STORAGE_ROOT/projects/p1/tmp/op-pending",
      manifestId: 1,
      manifestState: "pending",
      createdAt: "2025-01-01T10:00:00.000Z",
    },
    {
      path: "/var/fole/STORAGE_ROOT/projects/p1/tmp/op-old-committed",
      manifestId: 2,
      manifestState: "committed",
      createdAt: "2025-01-01T09:00:00.000Z",
    },
    {
      path: "/var/fole/STORAGE_ROOT/projects/p1/tmp/op-new-committed",
      manifestId: 3,
      manifestState: "committed",
      createdAt: "2025-01-01T11:30:00.000Z",
    },
    {
      path: "/var/fole/STORAGE_ROOT/projects/p1/tmp/op-missing-created",
      manifestId: 4,
      manifestState: "aborted",
    },
  ];

  const plan: ManifestCleanupPlan = storage.buildManifestCleanupPlan(nowIso, safetyWindowMs, tmpDirs);

  assert(plan.considered.length === 4, "All tmp dirs should be considered");

  const deletePaths = new Set(plan.toDelete.map((a) => a.tmpDir));
  const keepPaths = new Set(plan.toKeep.map((a) => a.tmpDir));

  assert(!deletePaths.has(tmpDirs[0].path), "Pending tmp dir must never be deleted");
  assert(keepPaths.has(tmpDirs[0].path), "Pending tmp dir should be marked keep/skip");

  assert(deletePaths.has(tmpDirs[1].path), "Old committed tmp dir should be eligible for deletion");

  assert(!deletePaths.has(tmpDirs[2].path), "New committed tmp dir should be kept until outside safety window");
  assert(keepPaths.has(tmpDirs[2].path), "New committed tmp dir should be marked keep/skip");

  assert(!deletePaths.has(tmpDirs[3].path), "Tmp dir without createdAt should be kept");
  assert(keepPaths.has(tmpDirs[3].path), "Tmp dir without createdAt should be marked keep/skip");
}

(async () => {
  await testManifestCleanupPlanRespectsPendingAndAgeWindow();
})();
