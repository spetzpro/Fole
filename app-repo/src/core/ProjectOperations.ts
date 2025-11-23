import type { CoreRuntime } from "./CoreRuntime";

export interface ProjectSnapshotOptions {
  readonly projectId: string;
  readonly author: string;
}

export class ProjectOperations {
  constructor(private readonly runtime: CoreRuntime) {}

  async commitProjectMetadataSnapshot(options: ProjectSnapshotOptions): Promise<void> {
    const { projectId, author } = options;

    const targetPath = `/projects/${projectId}/metadata.json`;

    await this.runtime.atomicWriteService.executeAtomicWrite(
      {
        opType: "project_metadata_write",
        author,
        targetPath,
        tmpDir: `${this.runtime.storagePaths.root}/tmp/project-${projectId}`,
        expectedFiles: [],
      },
      {
        async writeFiles() {},
        async fsyncFiles() {},
        async fsyncTmpDir() {},
        async atomicRename() {},
        async fsyncParentDir() {},
      },
    );
  }
}
