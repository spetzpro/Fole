import { CoreRuntime } from "../../src/core/CoreRuntime";
import { JobStatus } from "../../src/core/JobQueue";
import { runAutomationRequest, type AutomationRequest } from "../../src/core/AutomationRequests";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testProjectFullSyncAutomationRunsConfigAndMetadataJobs() {
  const runtime = new CoreRuntime({
    storageRoot: "/storage-automation-full-sync",
    useInMemoryDal: true,
    lockDiagnosticsRepositoryCapacity: 10,
  });

  const request: AutomationRequest = {
    id: "auto-full-sync-1",
    type: "project_full_sync",
    projectId: "proj-auto-full-sync",
    author: "automation-tester",
  };

  const result = await runAutomationRequest(runtime, request);

  assert(result.automationSummary.automationId === request.id, "automationId must match request id");
  assert(result.automationSummary.type === request.type, "automation type must match request type");
  assert(result.automationSummary.outcome === "success", "automation outcome must be success");

  assert(result.summaries.length === 2, "two job summaries expected for full sync");

  for (const summary of result.summaries) {
    assert(summary.status === JobStatus.Completed, "all jobs must complete successfully");
    assert(summary.automationId === request.id, "job summaries must reference automation id");
  }

  const committedEntries = await runtime.manifestRepository.listByState("committed");
  assert(committedEntries.length === 2, "two committed entries expected via automation");

  const opTypes = committedEntries.map((e) => e.opType).sort();
  assert(
    opTypes[0] === "project_config_write" && opTypes[1] === "project_metadata_write",
    "manifest must contain one config and one metadata write",
  );
}

(async () => {
  await testProjectFullSyncAutomationRunsConfigAndMetadataJobs();
})();
