import { CoreRuntime } from "../../src/core/CoreRuntime";
import { JobStatus } from "../../src/core/JobQueue";
import { runProjectConfigAndMetadataJobs } from "../../src/core/ProjectJobs";
import { ProjectOperations } from "../../src/core/ProjectOperations";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testProjectConfigAndMetadataViaJobsMatchesDirectOperations() {
  const runtime = new CoreRuntime({
    storageRoot: "/storage",
    useInMemoryDal: true,
    lockDiagnosticsRepositoryCapacity: 10,
  });

  const projectId = "proj-config-meta-via-jobs";
  const author = "jobs-orchestration-tester";

  const result = await runProjectConfigAndMetadataJobs(runtime, {
    projectId,
    author,
  });

  assert(result.configJob.status === JobStatus.Completed, "config job must complete successfully");
  assert(result.metadataJob.status === JobStatus.Completed, "metadata job must complete successfully");

  assert(result.configJobDiagnostics, "config job diagnostics must be present");
  assert(result.metadataJobDiagnostics, "metadata job diagnostics must be present");

  assert(
    result.configJobDiagnostics!.jobId === result.configJob.job.id,
    "config diagnostics must reference the config job id",
  );
  assert(
    result.metadataJobDiagnostics!.jobId === result.metadataJob.job.id,
    "metadata diagnostics must reference the metadata job id",
  );

  assert(
    result.configJobDiagnostics!.status === JobStatus.Completed,
    "config diagnostics status must be completed",
  );
  assert(
    result.metadataJobDiagnostics!.status === JobStatus.Completed,
    "metadata diagnostics status must be completed",
  );

  assert(result.configSummary.status === JobStatus.Completed, "config summary status must be completed");
  assert(
    result.metadataSummary.status === JobStatus.Completed,
    "metadata summary status must be completed",
  );

  const committedViaJobs = await runtime.manifestRepository.listByState("committed");
  assert(committedViaJobs.length === 2, "two committed entries expected via jobs");

  const opTypesViaJobs = committedViaJobs.map((e) => e.opType).sort();
  assert(
    opTypesViaJobs[0] === "project_config_write" && opTypesViaJobs[1] === "project_metadata_write",
    "via-jobs manifest must contain one config and one metadata write",
  );

  const targetPathsViaJobs = committedViaJobs.map((e) => e.targetPath).sort();
  assert(
    targetPathsViaJobs[0] === `/projects/${projectId}/config.json` &&
      targetPathsViaJobs[1] === `/projects/${projectId}/metadata.json`,
    "via-jobs manifest must target canonical project config and metadata paths",
  );

  const directRuntime = new CoreRuntime({
    storageRoot: "/storage-direct",
    useInMemoryDal: true,
    lockDiagnosticsRepositoryCapacity: 10,
  });

  const operations = new ProjectOperations(directRuntime);

  await operations.commitProjectConfig({
    projectId,
    author,
  });

  await operations.commitProjectMetadataSnapshot({
    projectId,
    author,
  });

  const committedDirect = await directRuntime.manifestRepository.listByState("committed");
  assert(committedDirect.length === 2, "two committed entries expected via direct ops");

  const opTypesDirect = committedDirect.map((e) => e.opType).sort();
  assert(
    opTypesDirect[0] === "project_config_write" && opTypesDirect[1] === "project_metadata_write",
    "direct manifest must contain one config and one metadata write",
  );

  const targetPathsDirect = committedDirect.map((e) => e.targetPath).sort();
  assert(
    targetPathsDirect[0] === `/projects/${projectId}/config.json` &&
      targetPathsDirect[1] === `/projects/${projectId}/metadata.json`,
    "direct manifest must target canonical project config and metadata paths",
  );
}

(async () => {
  await testProjectConfigAndMetadataViaJobsMatchesDirectOperations();
})();
