import { CoreRuntime } from "../../src/core/CoreRuntime";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testCoreRuntimeJobHelperRunsProjectConfigJob() {
  const runtime = new CoreRuntime({
    storageRoot: "/storage",
    useInMemoryDal: true,
    lockDiagnosticsRepositoryCapacity: 10,
  });

  const { queue, worker } = runtime.createInMemoryJobQueueAndWorker();

  const jobId = "core-runtime-job-helper-1";

  queue.enqueue({
    id: jobId,
    type: "commit_project_config",
    payload: {
      projectId: "proj-core-runtime-helper",
      author: "core-runtime-helper-author",
      jobId,
    },
  });

  await worker.runNext();

  const record = queue.getRecord(jobId);
  assert(record, "job record must exist after running job");
  assert(record!.status === "completed", "job status must be completed");

  const committedEntries = await runtime.manifestRepository.listByState("committed");
  assert(committedEntries.length === 1, "one committed manifest entry is expected");
  const entry = committedEntries[0];
  assert(entry.opType === "project_config_write", "opType must be project_config_write");
}

(async () => {
  await testCoreRuntimeJobHelperRunsProjectConfigJob();
})();
