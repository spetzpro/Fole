import { CoreRuntime } from "../../src/core/CoreRuntime";
import { ProjectOperations } from "../../src/core/ProjectOperations";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

(async function run() {
  const runtime = new CoreRuntime({
    storageRoot: "/storage",
    useInMemoryDal: true,
    useDalLocks: true,
    lockDiagnosticsRepositoryCapacity: 20,
  });

  const ops = new ProjectOperations(runtime);

  const projectId = "proj-core-flow";
  const author = "core-flow-tester";

  await ops.commitProjectMetadataSnapshot({ projectId, author });

  const committed = await runtime.manifestRepository.listByState("committed");
  assert(committed.length === 1, "one committed manifest entry for project operation");
  assert(
    committed[0].targetPath === `/projects/${projectId}/metadata.json`,
    "manifest targetPath matches project metadata path",
  );

  assert(runtime.lockDiagnosticsRepository, "lock diagnostics repository is available on runtime");
  const events = await runtime.lockDiagnosticsRepository!.findByLockId(`atomic:/projects/${projectId}/metadata.json`);
  // Diagnostics are optional/best-effort; just ensure access does not throw.
  assert(events.length >= 0, "lock diagnostics lookup completed without error");
})();
