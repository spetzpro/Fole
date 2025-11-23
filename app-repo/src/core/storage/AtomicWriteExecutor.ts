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

function buildLockIdForPlan(plan: AtomicWriteExecutionPlan): string {
  return `atomic:${plan.manifest.targetPath}`;
}

export class DefaultAtomicWriteExecutor implements AtomicWriteExecutor {
  private readonly lockManager: LockManager;

  constructor(lockManager: LockManager) {
    this.lockManager = lockManager;
  }

  async execute(plan: AtomicWriteExecutionPlan, hooks: AtomicWriteHooks): Promise<AtomicWriteExecutorResult> {
    const lockId: LockId = { id: buildLockIdForPlan(plan) };
    const owner: LockOwner = { ownerId: plan.manifest.author };
    const stepsExecuted: string[] = [];
    let lock: AcquiredLock | null = null;

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

      return {
        plan,
        stepsExecuted,
      };
    } finally {
      if (lock) {
        await this.lockManager.release(lock);
        stepsExecuted.push("release_lock");
      }
    }
  }
}
