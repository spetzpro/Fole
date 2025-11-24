import { CoreRuntime } from "../../src/core/CoreRuntime";
import {
  runCommitProjectConfigJob,
  runCommitProjectMetadataSnapshotJob,
  runCommitMapMetadataJob,
  runCommitMapSnapshotJob,
} from "../../src/core/ProjectJobs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testRepeatedProjectConfigWritesProduceMultipleManifestEntries() {
  const runtime = new CoreRuntime({
    storageRoot: "/storage",
    useInMemoryDal: true,
    lockDiagnosticsRepositoryCapacity: 10,
  });

  await runCommitProjectConfigJob(runtime, {
    projectId: "proj-job-repeated-config",
    author: "job-author-repeated-config",
    jobId: "job-config-1",
  });

  await runCommitProjectConfigJob(runtime, {
    projectId: "proj-job-repeated-config",
    author: "job-author-repeated-config",
    jobId: "job-config-2",
  });

  const committedEntries = await runtime.manifestRepository.listByState("committed");

  assert(
    committedEntries.length === 2,
    "two project config jobs should produce two committed manifest entries",
  );

  for (const entry of committedEntries) {
    assert(entry.opType === "project_config_write", "opType must be project_config_write");
    assert(
      entry.targetPath === "/projects/proj-job-repeated-config/config.json",
      "targetPath must point at the project config path",
    );
  }
}

async function testConcurrentMapMetadataAndSnapshotWritesSameMap() {
  const runtime = new CoreRuntime({
    storageRoot: "/storage",
    useInMemoryDal: true,
    lockDiagnosticsRepositoryCapacity: 10,
  });

  await Promise.all([
    runCommitMapMetadataJob(runtime, {
      projectId: "proj-job-concurrent-map",
      mapId: "map-concurrent",
      author: "job-author-concurrent",
      jobId: "job-map-meta-concurrent",
    }),
    runCommitMapSnapshotJob(runtime, {
      projectId: "proj-job-concurrent-map",
      mapId: "map-concurrent",
      author: "job-author-concurrent",
      jobId: "job-map-snap-concurrent",
    }),
  ]);

  const committedEntries = await runtime.manifestRepository.listByState("committed");

  assert(
    committedEntries.length === 2,
    "concurrent map metadata + snapshot jobs should produce two committed manifest entries",
  );

  const opTypes = committedEntries.map((e) => e.opType).sort();
  assert(
    opTypes[0] === "map_metadata_write" && opTypes[1] === "map_snapshot_write",
    "both map_metadata_write and map_snapshot_write entries must be present",
  );
}

(async () => {
  await testRepeatedProjectConfigWritesProduceMultipleManifestEntries();
  await testConcurrentMapMetadataAndSnapshotWritesSameMap();
})();
