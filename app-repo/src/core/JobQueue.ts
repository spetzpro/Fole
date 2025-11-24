// Minimal in-memory job queue and worker loop for core jobs.
// This is a simple, single-process abstraction intended to be
// replaced or extended by real automation infrastructure later.

import type { CoreRuntime } from "./CoreRuntime";
import {
  runCommitProjectConfigJob,
  runCommitProjectMetadataSnapshotJob,
  runCommitMapMetadataJob,
  runCommitMapSnapshotJob,
} from "./ProjectJobs";

export type CoreJobType =
  | "commit_project_config"
  | "commit_project_metadata_snapshot"
  | "commit_map_metadata"
  | "commit_map_snapshot";

export interface CoreJobBase {
  readonly id: string;
  readonly type: CoreJobType;
}

export interface CommitProjectConfigCoreJob extends CoreJobBase {
  readonly type: "commit_project_config";
  readonly payload: Parameters<typeof runCommitProjectConfigJob>[1];
}

export interface CommitProjectMetadataSnapshotCoreJob extends CoreJobBase {
  readonly type: "commit_project_metadata_snapshot";
  readonly payload: Parameters<typeof runCommitProjectMetadataSnapshotJob>[1];
}

export interface CommitMapMetadataCoreJob extends CoreJobBase {
  readonly type: "commit_map_metadata";
  readonly payload: Parameters<typeof runCommitMapMetadataJob>[1];
}
export interface CommitMapSnapshotCoreJob extends CoreJobBase {
  readonly type: "commit_map_snapshot";
  readonly payload: Parameters<typeof runCommitMapSnapshotJob>[1];
}

export type CoreJob =
  | CommitProjectConfigCoreJob
  | CommitProjectMetadataSnapshotCoreJob
  | CommitMapMetadataCoreJob
  | CommitMapSnapshotCoreJob;

export const JobStatus = {
  Pending: "pending" as const,
  Running: "running" as const,
  Completed: "completed" as const,
  Failed: "failed" as const,
};

export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const JobStatusValues: ReadonlyArray<JobStatus> = [
  JobStatus.Pending,
  JobStatus.Running,
  JobStatus.Completed,
  JobStatus.Failed,
];

export function isTerminalStatus(status: JobStatus): boolean {
  return status === JobStatus.Completed || status === JobStatus.Failed;
}

export interface JobRecord {
  readonly job: CoreJob;
  status: JobStatus;
  error?: unknown;
}

export class InMemoryJobQueue {
  private readonly queue: CoreJob[] = [];
  private readonly records = new Map<string, JobRecord>();

  enqueue(job: CoreJob): void {
    if (this.records.has(job.id)) {
      throw new Error(`Job with id ${job.id} already exists`);
    }
    const record: JobRecord = {
      job,
      status: JobStatus.Pending,
    };
    this.records.set(job.id, record);
    this.queue.push(job);
  }

  dequeue(): CoreJob | undefined {
    return this.queue.shift();
  }

  getRecord(id: string): JobRecord | undefined {
    return this.records.get(id);
  }
}

export class JobWorker {
  private readonly runtime: CoreRuntime;
  private readonly queue: InMemoryJobQueue;

  constructor(runtime: CoreRuntime, queue: InMemoryJobQueue) {
    this.runtime = runtime;
    this.queue = queue;
  }

  async runNext(): Promise<void> {
    const job = this.queue.dequeue();
    if (!job) {
      return;
    }

    const record = this.queue.getRecord(job.id);
    if (!record) {
      throw new Error("Job record missing for dequeued job");
    }

    record.status = JobStatus.Running;

    try {
      if (job.type === "commit_project_config") {
        await runCommitProjectConfigJob(this.runtime, job.payload);
      } else if (job.type === "commit_project_metadata_snapshot") {
        await runCommitProjectMetadataSnapshotJob(this.runtime, job.payload);
      } else if (job.type === "commit_map_metadata") {
        await runCommitMapMetadataJob(this.runtime, job.payload);
      } else if (job.type === "commit_map_snapshot") {
        await runCommitMapSnapshotJob(this.runtime, job.payload);
      } else {
        const _exhaustiveCheck: never = job;
        throw new Error(`Unsupported job type: ${String((_exhaustiveCheck as any).type)}`);
      }
      record.status = JobStatus.Completed;
    } catch (error) {
      record.status = JobStatus.Failed;
      record.error = error;
    }
  }
}
