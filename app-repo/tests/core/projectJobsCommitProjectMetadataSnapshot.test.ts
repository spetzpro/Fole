import { CoreRuntime } from "../../src/core/CoreRuntime";
import { runCommitProjectMetadataSnapshotJob } from "../../src/core/ProjectJobs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testRunCommitProjectMetadataSnapshotJobWritesManifestEntry() {
  const runtime = new CoreRuntime({
    storageRoot: "/storage",
    useInMemoryDal: true,
    lockDiagnosticsRepositoryCapacity: 10,
  });

  await runCommitProjectMetadataSnapshotJob(runtime, {
    projectId: "proj-job-metadata-snapshot",
    author: "job-author-metadata",
    jobId: "job-meta-123",
  });

  const committedEntries = await runtime.manifestRepository.listByState("committed");

  assert(
    committedEntries.length === 1,
    "commit project metadata snapshot job should produce exactly one committed manifest entry",
  );

  const entry = committedEntries[0];

  assert(entry.opType === "project_metadata_write", "opType must be project_metadata_write");
  assert(
    entry.targetPath === "/projects/proj-job-metadata-snapshot/metadata.json",
    "targetPath must point at the project metadata path",
  );
}

(async () => {
  await testRunCommitProjectMetadataSnapshotJobWritesManifestEntry();
})();
