import type { AtomicWriteExecutionPlan } from "./StoragePaths";
import type { AcquiredLock, LockId, LockManager, LockOwner } from "../concurrency/LockManager";
import { acquireWithRetry } from "../concurrency/LockManager";

export interface AtomicWriteHooks {
  writeFiles(plan: AtomicWriteExecutionPlan): Promise<void>;
  fsyncFiles(plan: AtomicWriteExecutionPlan): Promise<void>;
  fsyncTmpDir(plan: AtomicWriteExecutionPlan): Promise<void>;
  atomicRename(plan: AtomicWriteExecutionPlan): Promise<void>;
  fsyncParentDir(plan: AtomicWriteExecutionPlan): Promise<void>;
  updateManifest(plan: AtomicWriteExecutionPlan): Promise<void>;
  commitTransaction(plan: AtomicWriteExecutionPlan): Promise<void>;
}

export interface AtomicWriteExecutorResult {
  readonly plan: AtomicWriteExecutionPlan;
  readonly stepsExecuted: readonly string[];
}

export interface AtomicWriteExecutor {
  execute(plan: AtomicWriteExecutionPlan, hooks: AtomicWriteHooks): Promise<AtomicWriteExecutorResult>;
}

export type AtomicWriteDiagnosticsStatus = "success" | "failure";

export interface AtomicWriteDiagnosticsEvent {
  readonly targetPath: string;
  readonly author: string;
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly durationMs: number;
  readonly stepsExecuted: readonly string[];
  readonly status: AtomicWriteDiagnosticsStatus;
  readonly errorMessage?: string;
}

export interface AtomicWriteDiagnostics {
  onAtomicWriteComplete(event: AtomicWriteDiagnosticsEvent): void | Promise<void>;
}

function buildLockIdForPlan(plan: AtomicWriteExecutionPlan): string {
  return `atomic:${plan.manifest.targetPath}`;
}

export class DefaultAtomicWriteExecutor implements AtomicWriteExecutor {
  private readonly lockManager: LockManager;

  private readonly diagnostics?: AtomicWriteDiagnostics;

  constructor(lockManager: LockManager, diagnostics?: AtomicWriteDiagnostics) {
    this.lockManager = lockManager;
    this.diagnostics = diagnostics;
  }

  async execute(plan: AtomicWriteExecutionPlan, hooks: AtomicWriteHooks): Promise<AtomicWriteExecutorResult> {
    const startedAt = Date.now();
    const lockId: LockId = { id: buildLockIdForPlan(plan) };
    const owner: LockOwner = { ownerId: plan.manifest.author };
    const stepsExecuted: string[] = [];
    let lock: AcquiredLock | null = null;
    let errorMessage: string | undefined;

    let resultPlan: AtomicWriteExecutionPlan | null = null;
    let resultSteps: readonly string[] | null = null;

    try {
      // acquire_lock
      lock = await acquireWithRetry(this.lockManager, lockId, owner, "write");
      stepsExecuted.push("acquire_lock");

      // write_files
      await hooks.writeFiles(plan);
      stepsExecuted.push("write_files");

      // fsync_files
      await hooks.fsyncFiles(plan);
      stepsExecuted.push("fsync_files");

      // fsync_tmp_dir
      await hooks.fsyncTmpDir(plan);
      stepsExecuted.push("fsync_tmp_dir");

      // atomic_rename
      await hooks.atomicRename(plan);
      stepsExecuted.push("atomic_rename");

      // fsync_parent_dir
      await hooks.fsyncParentDir(plan);
      stepsExecuted.push("fsync_parent_dir");

      // update_manifest
      await hooks.updateManifest(plan);
      stepsExecuted.push("update_manifest");

      // commit_tx
      await hooks.commitTransaction(plan);
      stepsExecuted.push("commit_tx");

      resultPlan = plan;
      resultSteps = stepsExecuted.slice();

      return {
        plan,
        stepsExecuted,
      };
    } catch (err) {
      if (err instanceof Error) {
        errorMessage = err.message;
      } else {
        errorMessage = String(err);
      }
      throw err;
    } finally {
      if (lock) {
        await this.lockManager.release(lock);
        stepsExecuted.push("release_lock");
      }

      const finishedAt = Date.now();
      const durationMs = finishedAt - startedAt;

      if (this.diagnostics) {
        const status: AtomicWriteDiagnosticsStatus = errorMessage ? "failure" : "success";
        const event: AtomicWriteDiagnosticsEvent = {
          targetPath: plan.manifest.targetPath,
          author: plan.manifest.author,
          startedAt,
          finishedAt,
          durationMs,
          stepsExecuted: stepsExecuted.slice(),
          status,
          errorMessage,
        };

        try {
          await this.diagnostics.onAtomicWriteComplete(event);
        } catch {
          // Diagnostics failures must never break atomic writes.
        }
      }
    }
  }
}
