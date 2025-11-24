import { CoreRuntime } from "../../src/core/CoreRuntime";
import { JobStatus } from "../../src/core/JobQueue";
import { runAutomationRequest, type AutomationRequest } from "../../src/core/AutomationRequests";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testAutomationFailureSetsPartialSuccessOutcome() {
  const runtime = new CoreRuntime({
    storageRoot: "/storage-automation-failure",
    useInMemoryDal: true,
    lockDiagnosticsRepositoryCapacity: 10,
  });

  const request: AutomationRequest = {
    id: "auto-failure-1",
    type: "project_full_sync",
    projectId: "", // invalid for config, valid for metadata in this test context
    author: "automation-failure-tester",
  };

  const result = await runAutomationRequest(runtime, request as any);

  assert(result.summaries.length === 2, "two job summaries expected");

  const statuses = result.summaries.map((s) => s.status).sort();

  assert(statuses.includes(JobStatus.Failed), "at least one job must fail");
  assert(statuses.includes(JobStatus.Completed), "at least one job must complete");

  assert(
    result.automationSummary.outcome === "partial_success",
    "automation outcome must be partial_success for mixed results",
  );
}

(async () => {
  await testAutomationFailureSetsPartialSuccessOutcome();
})();
