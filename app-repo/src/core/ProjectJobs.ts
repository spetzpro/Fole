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
