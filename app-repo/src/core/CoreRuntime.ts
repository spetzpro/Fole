import { createStoragePaths, type StoragePaths } from "./storage/StoragePaths";
import { SqliteDalContext } from "./db/SqliteDalContext";
import { InMemoryDalContext } from "./db/InMemoryDalContext";
import type { DalContext } from "./db/DalContext";
import { InMemoryManifestRepository, type ManifestRepository } from "./storage/ManifestRepository";
import { createAtomicWriteService } from "./storage/AtomicWriteBootstrap";
import {
  InMemoryLockDiagnosticsRepository,
  RepositoryBackedLockDiagnostics,
} from "./concurrency/LockDiagnosticsRepository";
import type { LockDiagnosticsRepository } from "./concurrency/LockDiagnosticsRepository";
import type { AtomicWriteService } from "./storage/AtomicWriteService";
import { InMemoryJobQueue, JobWorker, InMemoryJobDiagnosticsRepository } from "./JobQueue";

export interface CoreRuntimeOptions {
  readonly storageRoot: string;
  readonly useInMemoryDal?: boolean;
  readonly useDalLocks?: boolean;
  readonly lockDiagnosticsRepositoryCapacity?: number;
}

export class CoreRuntime {
  readonly storagePaths: StoragePaths;
  readonly dal: DalContext;
  readonly manifestRepository: ManifestRepository;
  readonly atomicWriteService: AtomicWriteService;
  readonly lockDiagnosticsRepository?: LockDiagnosticsRepository;
  readonly jobDiagnosticsRepository: InMemoryJobDiagnosticsRepository;

  constructor(private readonly options: CoreRuntimeOptions) {
    this.storagePaths = createStoragePaths({ storageRoot: options.storageRoot });

    const useInMemoryDal = options.useInMemoryDal ?? false;

    this.dal = useInMemoryDal ? new InMemoryDalContext() : new SqliteDalContext(this.storagePaths);

    this.manifestRepository = new InMemoryManifestRepository();

    const diagnosticsRepo =
      typeof options.lockDiagnosticsRepositoryCapacity === "number"
        ? new InMemoryLockDiagnosticsRepository(options.lockDiagnosticsRepositoryCapacity)
        : undefined;

    this.lockDiagnosticsRepository = diagnosticsRepo;

    // DalLockManager requires a real DAL that persists tables. When using the
    // in-memory DAL, we always fall back to the in-memory lock manager even if
    // useDalLocks is requested, to avoid impossible owner checks against a
    // no-op DAL.
    const canUseDalLocks = !useInMemoryDal;
    const useDalLocks = canUseDalLocks && (options.useDalLocks ?? true);

    this.atomicWriteService = createAtomicWriteService({
      storagePaths: this.storagePaths,
      manifestRepository: this.manifestRepository,
      dalContext: this.dal,
      options: {
        lockManager: {
          useDal: useDalLocks,
          diagnostics: diagnosticsRepo ? new RepositoryBackedLockDiagnostics(diagnosticsRepo) : undefined,
        },
      },
    });

    this.jobDiagnosticsRepository = new InMemoryJobDiagnosticsRepository();
  }

  createInMemoryJobQueueAndWorker(): { queue: InMemoryJobQueue; worker: JobWorker } {
    const queue = new InMemoryJobQueue();
    const worker = new JobWorker(this, queue, this.jobDiagnosticsRepository);
    return { queue, worker };
  }
}
