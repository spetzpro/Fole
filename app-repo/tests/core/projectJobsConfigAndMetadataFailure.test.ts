import { CoreRuntime } from "../../src/core/CoreRuntime";
import { JobStatus } from "../../src/core/JobQueue";
import { runProjectConfigAndMetadataJobs } from "../../src/core/ProjectJobs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testConfigJobFailureDoesNotPreventMetadataJob() {
  const runtime = new CoreRuntime({
    storageRoot: "/storage-failure",
    useInMemoryDal: true,
    lockDiagnosticsRepositoryCapacity: 10,
  });

  const projectId = "proj-config-meta-failure";
  const author = "jobs-orchestration-failure-tester";

  // Arrange: set up a runtime where project config commit will fail by
  // providing an invalid projectId (empty string). Metadata commit uses
  // a valid projectId so it can still succeed.
  const result = await runProjectConfigAndMetadataJobs(runtime, {
    projectId: "", // invalid for config
    author,
  } as any);

  assert(result.configSummary.status === JobStatus.Failed, "config job must fail");
  assert(result.metadataSummary.status === JobStatus.Completed, "metadata job may still complete");

  assert(result.configJobDiagnostics, "config job diagnostics must be recorded");
  assert(result.metadataJobDiagnostics, "metadata job diagnostics must be recorded");

  const committed = await runtime.manifestRepository.listByState("committed");
  const opTypes = committed.map((e) => e.opType).sort();

  assert(
    opTypes.length >= 1 && opTypes.includes("project_metadata_write"),
    "at least metadata write should be committed in failure scenario",
  );
}

(async () => {
  await testConfigJobFailureDoesNotPreventMetadataJob();
})();
