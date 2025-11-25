import { createStoragePaths } from "../../src/core/storage/StoragePaths";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testModuleRuntimePathsMatchSpecLayout() {
  const storagePaths = createStoragePaths({ storageRoot: "/storage-modules" });

  const moduleName = "example-module";
  const paths = storagePaths.getModuleRuntimePaths(moduleName);

  assert(paths.moduleName === moduleName, "moduleName must round-trip in ModuleRuntimePaths");
  assert(
    paths.moduleRoot === `/modules/${moduleName}`,
    "moduleRoot must be STORAGE_ROOT/modules/<moduleName>/",
  );
}

(async () => {
  await testModuleRuntimePathsMatchSpecLayout();
})();
