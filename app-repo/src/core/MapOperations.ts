import type { CoreRuntime } from "./CoreRuntime";

export interface MapSnapshotOptions {
  readonly projectId: string;
  readonly mapId: string;
  readonly author: string;
}

export class MapOperations {
  constructor(private readonly runtime: CoreRuntime) {}

  async commitMapSnapshot(options: MapSnapshotOptions): Promise<void> {
    const { projectId, mapId, author } = options;

    const targetPath = `/projects/${projectId}/maps/${mapId}/snapshot.json`;
    const mapPaths = this.runtime.storagePaths.getMapPaths(projectId, mapId);

    await this.runtime.atomicWriteService.executeAtomicWrite(
      {
        opType: "map_snapshot_write",
        author,
        targetPath,
        tmpDir: `${mapPaths.mapTmpRoot}/snapshot`,
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
