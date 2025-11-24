import { InMemoryJobDiagnosticsRepository, JobStatus } from "../../src/core/JobQueue";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testGetByJobIdAndLatest() {
  const repo = new InMemoryJobDiagnosticsRepository();

  const baseTime = Date.now();

  repo.record({
    jobId: "job-1",
    jobType: "commit_project_config",
    status: JobStatus.Running,
    startedAt: baseTime,
    finishedAt: baseTime + 5,
    durationMs: 5,
  });

  repo.record({
    jobId: "job-2",
    jobType: "commit_map_metadata",
    status: JobStatus.Completed,
    startedAt: baseTime + 10,
    finishedAt: baseTime + 20,
    durationMs: 10,
  });

  repo.record({
    jobId: "job-1",
    jobType: "commit_project_config",
    status: JobStatus.Completed,
    startedAt: baseTime + 30,
    finishedAt: baseTime + 40,
    durationMs: 10,
  });

  const job1Events = repo.getByJobId("job-1");
  assert(job1Events.length === 2, "job-1 should have two events");
  assert(job1Events[0].status === JobStatus.Running, "first job-1 event should be running");
  assert(job1Events[1].status === JobStatus.Completed, "second job-1 event should be completed");

  const latestJob1 = repo.getLatestByJobId("job-1");
  assert(latestJob1, "latest event for job-1 must exist");
  assert(latestJob1!.status === JobStatus.Completed, "latest job-1 status should be completed");

  const latestJob2 = repo.getLatestByJobId("job-2");
  assert(latestJob2, "latest event for job-2 must exist");
  assert(latestJob2!.status === JobStatus.Completed, "latest job-2 status should be completed");

  const latestMissing = repo.getLatestByJobId("missing-job");
  assert(latestMissing === undefined, "latest event for unknown job should be undefined");
}

(async () => {
  await testGetByJobIdAndLatest();
})();
