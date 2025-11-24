import { CoreRuntime } from "../../src/core/CoreRuntime";
import { runCommitMapMetadataJob } from "../../src/core/ProjectJobs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testRunCommitMapMetadataJobWritesManifestEntry() {
  const runtime = new CoreRuntime({
    storageRoot: "/storage",
    useInMemoryDal: true,
    lockDiagnosticsRepositoryCapacity: 10,
  });

  await runCommitMapMetadataJob(runtime, {
    projectId: "proj-job-map-metadata",
    mapId: "map-1",
    author: "job-author-map",
    jobId: "job-map-123",
  });

  const committedEntries = await runtime.manifestRepository.listByState("committed");

  assert(
    committedEntries.length === 1,
    "commit map metadata job should produce exactly one committed manifest entry",
  );

  const entry = committedEntries[0];

  assert(entry.opType === "map_metadata_write", "opType must be map_metadata_write");
  assert(
    entry.targetPath === "/projects/proj-job-map-metadata/maps/map-1/metadata.json",
    "targetPath must point at the map metadata path",
  );
}

(async () => {
  await testRunCommitMapMetadataJobWritesManifestEntry();
})();
