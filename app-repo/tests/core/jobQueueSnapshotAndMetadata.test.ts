import { CoreRuntime } from "../../src/core/CoreRuntime";
import { InMemoryJobQueue, JobWorker, JobStatus } from "../../src/core/JobQueue";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testEnqueueAndRunProjectMetadataSnapshotJob() {
  const runtime = new CoreRuntime({
    storageRoot: "/storage",
    useInMemoryDal: true,
    lockDiagnosticsRepositoryCapacity: 10,
  });

  const queue = new InMemoryJobQueue();
  const worker = new JobWorker(runtime, queue);

  const jobId = "job-queue-project-meta-snap-1";

  queue.enqueue({
    id: jobId,
    type: "commit_project_metadata_snapshot",
    payload: {
      projectId: "proj-queue-project-meta-snap",
      author: "queue-author-project-meta-snap",
      jobId,
    },
  });

  await worker.runNext();

  const record = queue.getRecord(jobId);
  assert(record, "job record must exist after running job");
  assert(record!.status === JobStatus.Completed, "job status must be completed");

  const committedEntries = await runtime.manifestRepository.listByState("committed");
  assert(committedEntries.length === 1, "one committed manifest entry is expected");
  const entry = committedEntries[0];
  assert(entry.opType === "project_metadata_write", "opType must be project_metadata_write");
}

async function testEnqueueAndRunMapSnapshotJob() {
  const runtime = new CoreRuntime({
    storageRoot: "/storage",
    useInMemoryDal: true,
    lockDiagnosticsRepositoryCapacity: 10,
  });

  const queue = new InMemoryJobQueue();
  const worker = new JobWorker(runtime, queue);

  const jobId = "job-queue-map-snap-1";

  queue.enqueue({
    id: jobId,
    type: "commit_map_snapshot",
    payload: {
      projectId: "proj-queue-map-snap",
      mapId: "map-queue-snap-1",
      author: "queue-author-map-snap",
      jobId,
    },
  });

  await worker.runNext();

  const record = queue.getRecord(jobId);
  assert(record, "job record must exist after running job");
  assert(record!.status === JobStatus.Completed, "job status must be completed");

  const committedEntries = await runtime.manifestRepository.listByState("committed");
  assert(committedEntries.length === 1, "one committed manifest entry is expected");
  const entry = committedEntries[0];
  assert(entry.opType === "map_snapshot_write", "opType must be map_snapshot_write");
}

(async () => {
  await testEnqueueAndRunProjectMetadataSnapshotJob();
  await testEnqueueAndRunMapSnapshotJob();
})();
