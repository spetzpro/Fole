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
import type { JobDiagnosticsEvent, JobRecord, JobStatus } from "./JobQueue";

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

export async function runProjectConfigAndMetadataJobs(
  runtime: CoreRuntime,
  options: RunProjectConfigAndMetadataJobsOptions,
): Promise<RunProjectConfigAndMetadataJobsResult> {
  const { queue, worker } = runtime.createInMemoryJobQueueAndWorker();

  const configJobId = `job-project-config-${options.projectId}`;
  const metadataJobId = `job-project-metadata-${options.projectId}`;

  queue.enqueue({
    id: configJobId,
    type: "commit_project_config",
    payload: {
      projectId: options.projectId,
      author: options.author,
      jobId: configJobId,
    },
  });

  queue.enqueue({
    id: metadataJobId,
    type: "commit_project_metadata_snapshot",
    payload: {
      projectId: options.projectId,
      author: options.author,
      jobId: metadataJobId,
    },
  });

  await worker.runNext();
  await worker.runNext();

  const configRecord = queue.getRecord(configJobId);
  const metadataRecord = queue.getRecord(metadataJobId);

  if (!configRecord || !metadataRecord) {
    throw new Error("Expected job records to exist after running jobs");
  }

  const configDiagnostics = runtime.getLatestJobDiagnostics(configJobId);
  const metadataDiagnostics = runtime.getLatestJobDiagnostics(metadataJobId);

  return {
    configJob: configRecord,
    metadataJob: metadataRecord,
    configJobDiagnostics: configDiagnostics,
    metadataJobDiagnostics: metadataDiagnostics,
    configSummary: toJobRunSummary(configRecord, configDiagnostics),
    metadataSummary: toJobRunSummary(metadataRecord, metadataDiagnostics),
  };
}
