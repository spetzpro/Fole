import { CoreRuntime } from "../../src/core/CoreRuntime";
import { InMemoryJobQueue, JobWorker } from "../../src/core/JobQueue";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testEnqueueAndRunProjectConfigJob() {
  const runtime = new CoreRuntime({
    storageRoot: "/storage",
    useInMemoryDal: true,
    lockDiagnosticsRepositoryCapacity: 10,
  });

  const queue = new InMemoryJobQueue();
  const worker = new JobWorker(runtime, queue);

  const jobId = "job-queue-config-1";

  queue.enqueue({
    id: jobId,
    type: "commit_project_config",
    payload: {
      projectId: "proj-queue-config",
      author: "queue-author-config",
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

async function testEnqueueAndRunMapMetadataJob() {
  const runtime = new CoreRuntime({
    storageRoot: "/storage",
    useInMemoryDal: true,
    lockDiagnosticsRepositoryCapacity: 10,
  });

  const queue = new InMemoryJobQueue();
  const worker = new JobWorker(runtime, queue);

  const jobId = "job-queue-map-meta-1";

  queue.enqueue({
    id: jobId,
    type: "commit_map_metadata",
    payload: {
      projectId: "proj-queue-map-meta",
      mapId: "map-queue-1",
      author: "queue-author-map-meta",
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
  assert(entry.opType === "map_metadata_write", "opType must be map_metadata_write");
}

async function testJobFailureMarksRecordFailed() {
  const runtime = new CoreRuntime({
    storageRoot: "/storage",
    useInMemoryDal: true,
    lockDiagnosticsRepositoryCapacity: 10,
  });

  const queue = new InMemoryJobQueue();
  const worker = new JobWorker(runtime, queue);

  const jobId = "job-queue-config-fail";

  // Provide an invalid payload to force a failure (missing projectId).
  // Type assertion is used only in test to simulate a bad job.
  queue.enqueue({
    id: jobId,
    type: "commit_project_config",
    payload: {
      projectId: "", // invalid id expected to fail atomic write or validation later
      author: "queue-author-config-fail",
      jobId,
    } as any,
  });

  await worker.runNext();

  const record = queue.getRecord(jobId);
  assert(record, "job record must exist after running job");
  assert(record!.status === "failed", "job status must be failed when an error occurs");
  assert(record!.error, "failed job record must capture an error");
}

(async () => {
  await testEnqueueAndRunProjectConfigJob();
  await testEnqueueAndRunMapMetadataJob();
  await testJobFailureMarksRecordFailed();
})();
