import { AtomicWriteExecutor, AtomicWriteHooks } from "./AtomicWriteExecutor";
import { ManifestRepository } from "./ManifestRepository";
import { AtomicWriteExecutionPlan, AtomicWritePlanInput, StoragePaths } from "./StoragePaths";

export interface AtomicWriteServiceDeps {
  storagePaths: StoragePaths;
  manifestRepository: ManifestRepository;
  executor: AtomicWriteExecutor;
}

export class AtomicWriteService {
  private readonly storagePaths: StoragePaths;
  private readonly manifestRepository: ManifestRepository;
  private readonly executor: AtomicWriteExecutor;

  constructor(deps: AtomicWriteServiceDeps) {
    this.storagePaths = deps.storagePaths;
    this.manifestRepository = deps.manifestRepository;
    this.executor = deps.executor;
  }

  async executeAtomicWrite(
    input: AtomicWritePlanInput,
    hooks: Omit<AtomicWriteHooks, "updateManifest" | "commitTransaction">,
  ): Promise<void> {
    const manifestRow = await this.manifestRepository.createPending({
      opType: input.opType,
      targetPath: input.targetPath,
      tmpPath: input.tmpDir,
      expectedFiles: input.expectedFiles,
      author: input.author,
    });

    const basePlan: AtomicWriteExecutionPlan = this.storagePaths.buildAtomicWriteExecutionPlan({
      ...input,
      tmpDir: input.tmpDir,
      expectedFiles: input.expectedFiles,
    });

    const plan: AtomicWriteExecutionPlan = {
      ...basePlan,
      manifest: {
        ...basePlan.manifest,
        id: manifestRow.id,
      },
    };

    const manifestRepository = this.manifestRepository;

    const wrappedHooks: AtomicWriteHooks = {
      ...hooks,
      async updateManifest(p: AtomicWriteExecutionPlan): Promise<void> {
        const existing = await manifestRepository.getById(p.manifest.id!);
        if (!existing) {
          throw new Error("Manifest row not found during updateManifest");
        }
      },
      async commitTransaction(p: AtomicWriteExecutionPlan): Promise<void> {
        const committedAt = new Date().toISOString();
        const updated = await manifestRepository.markCommitted(p.manifest.id!, 1, committedAt);
        if (!updated || updated.state !== "committed") {
          throw new Error("Failed to mark manifest as committed");
        }
      },
    };

    await this.executor.execute(plan, wrappedHooks);
  }
}
