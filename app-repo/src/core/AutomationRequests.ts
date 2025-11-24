import type { CoreRuntime } from "./CoreRuntime";
import type { CoreJob } from "./JobQueue";
import { JobStatus } from "./JobQueue";
import type { GenericJobOrchestrationResult, JobRunSummary } from "./ProjectJobs";
import { runJobsViaInMemoryQueue } from "./ProjectJobs";

export type AutomationRequestType = "project_full_sync" | "project_metadata_refresh";

export interface AutomationRequest {
  readonly id: string;
  readonly type: AutomationRequestType;
  readonly projectId: string;
  readonly author: string;
  readonly estimatedCostCpu?: number;
  readonly estimatedCostMemoryMb?: number;
  readonly estimatedMaxRuntimeSeconds?: number;
}

export interface AutomationRunSummary {
  readonly automationId: string;
  readonly type: AutomationRequestType;
  readonly outcome: "success" | "partial_success" | "failed";
  readonly jobSummaries: JobRunSummary[];
}

export function planJobsForAutomationRequest(request: AutomationRequest): CoreJob[] {
  const baseProjectId = request.projectId;
  const baseAuthor = request.author;

  if (request.type === "project_full_sync") {
    const configJobId = `auto-project-config-${baseProjectId}-${request.id}`;
    const metadataJobId = `auto-project-metadata-${baseProjectId}-${request.id}`;

    return [
      {
        id: configJobId,
        type: "commit_project_config",
        payload: {
          projectId: baseProjectId,
          author: baseAuthor,
          jobId: configJobId,
        },
      },
      {
        id: metadataJobId,
        type: "commit_project_metadata_snapshot",
        payload: {
          projectId: baseProjectId,
          author: baseAuthor,
          jobId: metadataJobId,
        },
      },
    ];
  }

  if (request.type === "project_metadata_refresh") {
    const metadataJobId = `auto-project-metadata-${baseProjectId}-${request.id}`;

    return [
      {
        id: metadataJobId,
        type: "commit_project_metadata_snapshot",
        payload: {
          projectId: baseProjectId,
          author: baseAuthor,
          jobId: metadataJobId,
        },
      },
    ];
  }

  const _exhaustiveCheck: never = request.type;
  throw new Error(`Unsupported automation request type: ${String(_exhaustiveCheck)}`);
}

export function computeAutomationOutcome(jobSummaries: ReadonlyArray<JobRunSummary>):
  | "success"
  | "partial_success"
  | "failed" {
  const hasFailure = jobSummaries.some((summary) => summary.status === JobStatus.Failed);
  const allFailed =
    jobSummaries.length > 0 && jobSummaries.every((summary) => summary.status === JobStatus.Failed);

  if (!hasFailure) {
    return "success";
  }

  if (allFailed) {
    return "failed";
  }

  return "partial_success";
}

export interface AutomationExecutionResult extends GenericJobOrchestrationResult {
  readonly automationId: string;
  readonly automationType: AutomationRequestType;
  readonly automationSummary: AutomationRunSummary;
}

export async function runAutomationRequest(
  runtime: CoreRuntime,
  request: AutomationRequest,
): Promise<AutomationExecutionResult> {
  const jobs = planJobsForAutomationRequest(request);

  const orchestrationResult = await runJobsViaInMemoryQueue(runtime, jobs);

  const taggedSummaries: JobRunSummary[] = orchestrationResult.summaries.map((summary) => ({
    ...summary,
    automationId: request.id,
  }));

  const outcome = computeAutomationOutcome(taggedSummaries);

  const automationSummary: AutomationRunSummary = {
    automationId: request.id,
    type: request.type,
    outcome,
    jobSummaries: taggedSummaries,
  };

  return {
    automationId: request.id,
    automationType: request.type,
    automationSummary,
    jobs: orchestrationResult.jobs,
    diagnostics: orchestrationResult.diagnostics,
    summaries: taggedSummaries,
  };
}
