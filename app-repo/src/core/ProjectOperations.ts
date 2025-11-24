import type { CoreRuntime } from "./CoreRuntime";

// Project-level atomic write helpers.
// See storage layout and atomic pattern in `specs/core/_AI_STORAGE_ARCHITECTURE.md`.

export interface ProjectSnapshotOptions {
  readonly projectId: string;
  readonly author: string;
}

export interface ProjectConfigOptions {
  readonly projectId: string;
  readonly author: string;
}

export class ProjectOperations {
  constructor(private readonly runtime: CoreRuntime) {}

  async commitProjectMetadataSnapshot(options: ProjectSnapshotOptions): Promise<void> {
    const { projectId, author } = options;

    const targetPath = `/projects/${projectId}/metadata.json`;
    const projectPaths = this.runtime.storagePaths.getProjectPaths(projectId);

    await this.runtime.atomicWriteService.executeAtomicWrite(
      {
        opType: "project_metadata_write",
        author,
        targetPath,
        tmpDir: `${projectPaths.projectTmpRoot}/project-metadata`,
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

  async commitProjectConfig(options: ProjectConfigOptions): Promise<void> {
    const { projectId, author } = options;

    const targetPath = `/projects/${projectId}/config.json`;
    const projectPaths = this.runtime.storagePaths.getProjectPaths(projectId);

    await this.runtime.atomicWriteService.executeAtomicWrite(
      {
        opType: "project_config_write",
        author,
        targetPath,
        tmpDir: `${projectPaths.projectTmpRoot}/project-config`,
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
