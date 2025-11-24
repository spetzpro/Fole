import { CoreRuntime } from "../../src/core/CoreRuntime";
import { runCommitProjectConfigJob } from "../../src/core/ProjectJobs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testRunCommitProjectConfigJobWritesManifestEntry() {
  const runtime = new CoreRuntime({
    storageRoot: "/storage",
    useInMemoryDal: true,
    lockDiagnosticsRepositoryCapacity: 10,
  });

  await runCommitProjectConfigJob(runtime, {
    projectId: "proj-job-config",
    author: "job-author",
    jobId: "job-123",
  });

  const committedEntries = await runtime.manifestRepository.listByState("committed");

  assert(
    committedEntries.length === 1,
    "commit project config job should produce exactly one committed manifest entry",
  );

  const entry = committedEntries[0];

  assert(entry.opType === "project_config_write", "opType must be project_config_write");
  assert(
    entry.targetPath === "/projects/proj-job-config/config.json",
    "targetPath must point at the project config path",
  );
}

(async () => {
  await testRunCommitProjectConfigJobWritesManifestEntry();
})();
