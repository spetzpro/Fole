import { createStoragePaths, type StoragePaths } from "./storage/StoragePaths";
import { SqliteDalContext } from "./db/SqliteDalContext";
import { InMemoryDalContext } from "./db/InMemoryDalContext";
import type { DalContext } from "./db/DalContext";
import { InMemoryManifestRepository, type ManifestRepository } from "./storage/ManifestRepository";
import { createAtomicWriteService } from "./storage/AtomicWriteBootstrap";
import type { AtomicWriteService } from "./storage/AtomicWriteService";

export interface CoreRuntimeOptions {
  readonly storageRoot: string;
  readonly useInMemoryDal?: boolean;
  readonly useDalLocks?: boolean;
}

export class CoreRuntime {
  readonly storagePaths: StoragePaths;
  readonly dal: DalContext;
  readonly manifestRepository: ManifestRepository;
  readonly atomicWriteService: AtomicWriteService;

  constructor(private readonly options: CoreRuntimeOptions) {
    this.storagePaths = createStoragePaths({ storageRoot: options.storageRoot });

    this.dal = options.useInMemoryDal
      ? new InMemoryDalContext()
      : new SqliteDalContext(this.storagePaths);

    this.manifestRepository = new InMemoryManifestRepository();

    this.atomicWriteService = createAtomicWriteService({
      storagePaths: this.storagePaths,
      manifestRepository: this.manifestRepository,
      dalContext: this.dal,
      options: {
        lockManager: {
          useDal: options.useDalLocks ?? true,
        },
      },
    });
  }
}
