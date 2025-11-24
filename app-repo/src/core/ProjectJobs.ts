import type { CoreRuntime } from "./CoreRuntime";
import {
  ProjectOperations,
  type ProjectConfigOptions,
  type ProjectSnapshotOptions,
} from "./ProjectOperations";
import {
  MapOperations,
  type MapMetadataOptions,
  type MapSnapshotOptions,
} from "./MapOperations";
import type { CoreJob, JobDiagnosticsEvent, JobRecord, JobStatus } from "./JobQueue";

// Minimal job-shaped helpers for project/map metadata/config commits.
// These are thin wrappers around core operations so they can later
// be called from a real job/operations system without changing CORE.

export interface CommitProjectConfigJobPayload extends ProjectConfigOptions {
  readonly jobId?: string;
}

export async function runCommitProjectConfigJob(
  runtime: CoreRuntime,
  payload: CommitProjectConfigJobPayload,
): Promise<void> {
  const operations = new ProjectOperations(runtime);
  await operations.commitProjectConfig(payload);
}

export interface CommitProjectMetadataSnapshotJobPayload extends ProjectSnapshotOptions {
  readonly jobId?: string;
}

export async function runCommitProjectMetadataSnapshotJob(
  runtime: CoreRuntime,
  payload: CommitProjectMetadataSnapshotJobPayload,
): Promise<void> {
  const operations = new ProjectOperations(runtime);
  await operations.commitProjectMetadataSnapshot(payload);
}

export interface CommitMapMetadataJobPayload extends MapMetadataOptions {
  readonly jobId?: string;
}

export async function runCommitMapMetadataJob(
  runtime: CoreRuntime,
  payload: CommitMapMetadataJobPayload,
): Promise<void> {
  const operations = new MapOperations(runtime);
  await operations.commitMapMetadata(payload);
}

export interface CommitMapSnapshotJobPayload extends MapSnapshotOptions {
  readonly jobId?: string;
}

export async function runCommitMapSnapshotJob(
  runtime: CoreRuntime,
  payload: CommitMapSnapshotJobPayload,
): Promise<void> {
  const operations = new MapOperations(runtime);
  await operations.commitMapSnapshot(payload);
}

export interface RunProjectConfigAndMetadataJobsOptions {
  readonly projectId: string;
  readonly author: string;
}

export interface JobRunSummary {
  readonly jobId: string;
  readonly jobType: string;
  readonly status: JobStatus;
  readonly durationMs?: number;
  readonly errorMessage?: string;
}

export function toJobRunSummary(
  record: JobRecord,
  diagnostics?: JobDiagnosticsEvent,
): JobRunSummary {
  return {
    jobId: record.job.id,
    jobType: record.job.type,
    status: record.status,
    durationMs: diagnostics?.durationMs,
    errorMessage: diagnostics?.errorMessage,
  };
}

export interface RunProjectConfigAndMetadataJobsResult {
  readonly configJob: JobRecord;
  readonly metadataJob: JobRecord;
  readonly configJobDiagnostics?: JobDiagnosticsEvent;
  readonly metadataJobDiagnostics?: JobDiagnosticsEvent;
  readonly configSummary: JobRunSummary;
  readonly metadataSummary: JobRunSummary;
}

export interface GenericJobOrchestrationResult {
  readonly jobs: JobRecord[];
  readonly diagnostics: ReadonlyArray<JobDiagnosticsEvent | undefined>;
  readonly summaries: JobRunSummary[];
}

export async function runJobsViaInMemoryQueue(
  runtime: CoreRuntime,
  jobs: ReadonlyArray<CoreJob>,
): Promise<GenericJobOrchestrationResult> {
  const { queue, worker } = runtime.createInMemoryJobQueueAndWorker();

  for (const job of jobs) {
    queue.enqueue(job);
  }

  for (let i = 0; i < jobs.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await worker.runNext();
  }

  const jobRecords: JobRecord[] = [];
  const diagnostics: Array<JobDiagnosticsEvent | undefined> = [];
  const summaries: JobRunSummary[] = [];

  for (const job of jobs) {
    const record = queue.getRecord(job.id);
    if (!record) {
      throw new Error("Expected job record to exist after running jobs");
    }
    jobRecords.push(record);

    const latestDiagnostics = runtime.getLatestJobDiagnostics(job.id);
    diagnostics.push(latestDiagnostics);
    summaries.push(toJobRunSummary(record, latestDiagnostics));
  }

  return {
    jobs: jobRecords,
    diagnostics,
    summaries,
  };
}

export async function runProjectConfigAndMetadataJobs(
  runtime: CoreRuntime,
  options: RunProjectConfigAndMetadataJobsOptions,
): Promise<RunProjectConfigAndMetadataJobsResult> {
  const configJobId = `job-project-config-${options.projectId}`;
  const metadataJobId = `job-project-metadata-${options.projectId}`;
  const jobs: CoreJob[] = [
    {
      id: configJobId,
      type: "commit_project_config",
      payload: {
        projectId: options.projectId,
        author: options.author,
        jobId: configJobId,
      },
    },
    {
      id: metadataJobId,
      type: "commit_project_metadata_snapshot",
      payload: {
        projectId: options.projectId,
        author: options.author,
        jobId: metadataJobId,
      },
    },
  ];

  const result = await runJobsViaInMemoryQueue(runtime, jobs);

  const [configRecord, metadataRecord] = result.jobs;
  const [configDiagnostics, metadataDiagnostics] = result.diagnostics;

  return {
    configJob: configRecord,
    metadataJob: metadataRecord,
    configJobDiagnostics: configDiagnostics,
    metadataJobDiagnostics: metadataDiagnostics,
    configSummary: result.summaries[0],
    metadataSummary: result.summaries[1],
  };
}
