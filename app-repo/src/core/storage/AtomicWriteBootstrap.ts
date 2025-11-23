import { DefaultAtomicWriteExecutor } from "./AtomicWriteExecutor";
import type { AtomicWriteExecutor } from "./AtomicWriteExecutor";
import { AtomicWriteService, type AtomicWriteServiceDeps } from "./AtomicWriteService";
import { createLockManager, type LockManagerFactoryOptions } from "../concurrency/LockManager";
import type { DalContext } from "../db/DalContext";
import type { StoragePaths } from "./StoragePaths";
import type { ManifestRepository } from "./ManifestRepository";
import type { AtomicWriteDiagnosticsRepository } from "./AtomicWriteDiagnosticsRepository";

export interface AtomicWriteRuntimeOptions {
  readonly lockManager?: LockManagerFactoryOptions;
}

export interface AtomicWriteRuntimeDeps {
  readonly storagePaths: StoragePaths;
  readonly manifestRepository: ManifestRepository;
  readonly dalContext?: DalContext;
  readonly diagnosticsRepository?: AtomicWriteDiagnosticsRepository;
  readonly options?: AtomicWriteRuntimeOptions;
}

export function createAtomicWriteService(deps: AtomicWriteRuntimeDeps): AtomicWriteService {
  const { storagePaths, manifestRepository, dalContext, diagnosticsRepository, options } = deps;

  const lockManagerOptions: LockManagerFactoryOptions = options?.lockManager ?? {};

  let effectiveOptions: LockManagerFactoryOptions = lockManagerOptions;
  if (lockManagerOptions.useDal && !lockManagerOptions.dal && dalContext) {
    effectiveOptions = { ...lockManagerOptions, dal: dalContext };
  }

  const lockManager = createLockManager(effectiveOptions);
  const executor: AtomicWriteExecutor = new DefaultAtomicWriteExecutor(lockManager);

  const serviceDeps: AtomicWriteServiceDeps = {
    storagePaths,
    manifestRepository,
    executor,
    diagnosticsRepository,
  };

  return new AtomicWriteService(serviceDeps);
}
