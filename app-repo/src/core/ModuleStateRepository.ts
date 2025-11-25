import type { CoreRuntime } from "./CoreRuntime";
import type { ExpectedFile } from "./storage/StoragePaths";

export interface ModuleStateWriteOptions {
  readonly moduleName: string;
  readonly stateId: string;
  readonly author: string;
  readonly contentJson: unknown;
}

export interface ModuleStateDescriptor {
  readonly moduleName: string;
  readonly stateId: string;
  readonly targetPath: string;
}

export class ModuleStateRepository {
  constructor(private readonly runtime: CoreRuntime) {}

  getStateDescriptor(moduleName: string, stateId: string): ModuleStateDescriptor {
    const modulePaths = this.runtime.storagePaths.getModuleRuntimePaths(moduleName);
    const targetPath = `${modulePaths.moduleRoot}/state/${stateId}.json`;

    return {
      moduleName,
      stateId,
      targetPath,
    };
  }

  async writeState(options: ModuleStateWriteOptions): Promise<ModuleStateDescriptor> {
    const { moduleName, stateId, author, contentJson } = options;
    const descriptor = this.getStateDescriptor(moduleName, stateId);

    const expectedFiles: ExpectedFile[] = [
      {
        relativePath: "state.json",
        sha256: "", // caller may extend to compute checksums later; not required here.
      },
    ];

    const tmpDir = `${descriptor.targetPath}.tmp`;

    const plan = this.runtime.storagePaths.buildAtomicWriteExecutionPlan({
      opType: "module_state_write",
      author,
      targetPath: descriptor.targetPath,
      tmpDir,
      expectedFiles,
    });

    await this.runtime.atomicWriteService.executeJson(plan, contentJson);

    return descriptor;
  }
}
