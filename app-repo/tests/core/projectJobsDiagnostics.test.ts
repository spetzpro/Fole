import { CoreRuntime } from "../../src/core/CoreRuntime";
import { runCommitProjectConfigJob } from "../../src/core/ProjectJobs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testProjectConfigJobProducesDiagnosticsEvent() {
  const runtime = new CoreRuntime({
    storageRoot: "/storage",
    useInMemoryDal: true,
    lockDiagnosticsRepositoryCapacity: 10,
    atomicWriteDiagnosticsRepositoryCapacity: 10,
  });

  await runCommitProjectConfigJob(runtime, {
    projectId: "proj-job-diag-config",
    author: "job-author-diag",
    jobId: "job-diag-123",
  });

  const recent = runtime.atomicWriteDiagnosticsRepository.getRecent(10);

  assert(recent.length >= 1, "atomic write diagnostics should contain at least one event");

  const event = recent[0];

  assert(
    event.targetPath === "/projects/proj-job-diag-config/config.json",
    "diagnostics event must use project config targetPath",
  );

  assert(event.author === "job-author-diag", "diagnostics event must record the job author");

  assert(
    event.stepsExecuted.includes("acquire_lock") &&
      event.stepsExecuted.includes("commit_tx") &&
      event.stepsExecuted.includes("release_lock"),
    "diagnostics event must record core atomic write steps",
  );
}

(async () => {
  await testProjectConfigJobProducesDiagnosticsEvent();
})();
