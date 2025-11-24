// Minimal in-memory job queue and worker loop for core jobs.
// This is a simple, single-process abstraction intended to be
// replaced or extended by real automation infrastructure later.

import type { CoreRuntime } from "./CoreRuntime";
import {
  runCommitProjectConfigJob,
  runCommitMapMetadataJob,
} from "./ProjectJobs";

export type CoreJobType =
  | "commit_project_config"
  | "commit_map_metadata";

export interface CoreJobBase {
  readonly id: string;
  readonly type: CoreJobType;
}

export interface CommitProjectConfigCoreJob extends CoreJobBase {
  readonly type: "commit_project_config";
  readonly payload: Parameters<typeof runCommitProjectConfigJob>[1];
}

export interface CommitMapMetadataCoreJob extends CoreJobBase {
  readonly type: "commit_map_metadata";
  readonly payload: Parameters<typeof runCommitMapMetadataJob>[1];
}

export type CoreJob = CommitProjectConfigCoreJob | CommitMapMetadataCoreJob;

export type JobStatus = "pending" | "running" | "completed" | "failed";

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
      status: "pending",
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

    record.status = "running";

    try {
      if (job.type === "commit_project_config") {
        await runCommitProjectConfigJob(this.runtime, job.payload);
      } else if (job.type === "commit_map_metadata") {
        await runCommitMapMetadataJob(this.runtime, job.payload);
      } else {
        const _exhaustiveCheck: never = job;
        throw new Error(`Unsupported job type: ${String((_exhaustiveCheck as any).type)}`);
      }
      record.status = "completed";
    } catch (error) {
      record.status = "failed";
      record.error = error;
    }
  }
}
