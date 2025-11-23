import { createStoragePaths } from "../../src/core/storage/StoragePaths";

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

(function run() {
  const storageRoot = "/var/fole/STORAGE_ROOT";
  const paths = createStoragePaths({ storageRoot });

  const core = paths.getCorePaths();
  assertEqual(core.coreDbPath, "/var/fole/STORAGE_ROOT/core/core.db", "core.db path");

  const project = paths.getProjectPaths("project-123");
  assertEqual(project.projectRoot, "/var/fole/STORAGE_ROOT/projects/project-123", "project root");
  assertEqual(project.projectDbPath, "/var/fole/STORAGE_ROOT/projects/project-123/project.db", "project db path");
  assertEqual(project.projectTmpRoot, "/var/fole/STORAGE_ROOT/projects/project-123/tmp", "project tmp root");

  const map = paths.getMapPaths("project-123", "map-abc");
  assertEqual(map.mapRoot, "/var/fole/STORAGE_ROOT/projects/project-123/maps/map-abc", "map root");
  assertEqual(map.mapDbPath, "/var/fole/STORAGE_ROOT/projects/project-123/maps/map-abc/map.db", "map db path");
  assertEqual(map.mapTilesRoot, "/var/fole/STORAGE_ROOT/projects/project-123/maps/map-abc/tiles", "map tiles root");
  assertEqual(map.mapFilesRoot, "/var/fole/STORAGE_ROOT/projects/project-123/maps/map-abc/files", "map files root");
  assertEqual(map.mapTmpRoot, "/var/fole/STORAGE_ROOT/projects/project-123/maps/map-abc/tmp", "map tmp root");

  // If we got here, basic layout matches _AI_STORAGE_ARCHITECTURE.md.
})();
