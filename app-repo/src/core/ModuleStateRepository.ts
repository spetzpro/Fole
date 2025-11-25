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
    const modulePaths = this.runtime.storagePaths.getModuleRuntimePaths(moduleName);

    const expectedFiles: ExpectedFile[] = [
      {
        relativePath: "state.json",
        sha256: "", // caller may extend to compute checksums later; not required here.
      },
    ];

    const tmpDir = `${modulePaths.moduleRoot}/tmp/${stateId}.tmp`;

    const input = {
      opType: "module_state_write" as const,
      author,
      targetPath: descriptor.targetPath,
      tmpDir,
      expectedFiles,
    };

    await this.runtime.atomicWriteService.executeAtomicWrite(input, {
      async writeFiles() {},
      async fsyncFiles() {},
      async fsyncTmpDir() {},
      async atomicRename() {},
      async fsyncParentDir() {},
    });

    return descriptor;
  }
}
