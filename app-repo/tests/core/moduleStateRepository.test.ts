import { CoreRuntime } from "../../src/core/CoreRuntime";
import { ModuleStateRepository } from "../../src/core/ModuleStateRepository";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testModuleStateRepositoryWritesViaAtomicServiceWithCanonicalPaths() {
  const runtime = new CoreRuntime({
    storageRoot: "/storage-mod-state",
    useInMemoryDal: true,
    lockDiagnosticsRepositoryCapacity: 32,
  });

  const repo = new ModuleStateRepository(runtime);

  const descriptor = await repo.writeState({
    moduleName: "example-module",
    stateId: "test-state",
    author: "tester",
    contentJson: { foo: "bar" },
  });

  assert(
    descriptor.targetPath === "/storage-mod-state/modules/example-module/state/test-state.json",
    "Module state targetPath must be STORAGE_ROOT/modules/<moduleName>/state/<stateId>.json",
  );

  const committedEntries = await runtime.manifestRepository.listByState("committed");
  assert(
    committedEntries.length === 1,
    "Module state write must create exactly one committed manifest entry",
  );

  const [entry] = committedEntries;
  assert(entry.opType === "module_state_write", "Manifest opType must be module_state_write");
  assert(
    entry.targetPath === descriptor.targetPath,
    "Manifest targetPath must match module state descriptor targetPath",
  );
}

(async () => {
  await testModuleStateRepositoryWritesViaAtomicServiceWithCanonicalPaths();
})();
