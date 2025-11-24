import type { CoreRuntime } from "./CoreRuntime";

// Map-level atomic write helpers.
// See storage layout and atomic pattern in `specs/core/_AI_STORAGE_ARCHITECTURE.md`.

export interface MapSnapshotOptions {
  readonly projectId: string;
  readonly mapId: string;
  readonly author: string;
}

export interface MapMetadataOptions {
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

  async commitMapMetadata(options: MapMetadataOptions): Promise<void> {
    const { projectId, mapId, author } = options;

    const targetPath = `/projects/${projectId}/maps/${mapId}/metadata.json`;
    const mapPaths = this.runtime.storagePaths.getMapPaths(projectId, mapId);

    await this.runtime.atomicWriteService.executeAtomicWrite(
      {
        opType: "map_metadata_write",
        author,
        targetPath,
        tmpDir: `${mapPaths.mapTmpRoot}/metadata`,
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
