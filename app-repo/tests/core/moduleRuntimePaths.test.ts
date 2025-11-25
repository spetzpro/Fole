import { createStoragePaths } from "../../src/core/storage/StoragePaths";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testModuleRuntimePathsMatchSpecLayout() {
  const STORAGE_ROOT = "/storage-modules";
  const storagePaths = createStoragePaths({ storageRoot: STORAGE_ROOT });

  const moduleName = "example-module";
  const paths = storagePaths.getModuleRuntimePaths(moduleName);

  assert(paths.moduleName === moduleName, "moduleName must round-trip in ModuleRuntimePaths");
  assert(
    paths.moduleRoot === `${STORAGE_ROOT}/modules/${moduleName}`,
    "moduleRoot must be STORAGE_ROOT/modules/<moduleName>/",
  );
}

(async () => {
  await testModuleRuntimePathsMatchSpecLayout();
})();
