import { CoreRuntime } from "../../src/core/CoreRuntime";
import { runCommitMapSnapshotJob } from "../../src/core/ProjectJobs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testRunCommitMapSnapshotJobWritesManifestEntry() {
  const runtime = new CoreRuntime({
    storageRoot: "/storage",
    useInMemoryDal: true,
    lockDiagnosticsRepositoryCapacity: 10,
  });

  await runCommitMapSnapshotJob(runtime, {
    projectId: "proj-job-map-snapshot",
    mapId: "map-snap-1",
    author: "job-author-map-snapshot",
    jobId: "job-map-snap-123",
  });

  const committedEntries = await runtime.manifestRepository.listByState("committed");

  assert(
    committedEntries.length === 1,
    "commit map snapshot job should produce exactly one committed manifest entry",
  );

  const entry = committedEntries[0];

  assert(entry.opType === "map_snapshot_write", "opType must be map_snapshot_write");
  assert(
    entry.targetPath === "/projects/proj-job-map-snapshot/maps/map-snap-1/snapshot.json",
    "targetPath must point at the map snapshot path",
  );
}

(async () => {
  await testRunCommitMapSnapshotJobWritesManifestEntry();
})();
