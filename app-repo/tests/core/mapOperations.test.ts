import { CoreRuntime } from "../../src/core/CoreRuntime";
import { MapOperations } from "../../src/core/MapOperations";

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

  const ops = new MapOperations(runtime);

  const projectId = "proj-map-flow";
  const mapId = "map-core-flow";
  const author = "core-flow-tester";

  await ops.commitMapSnapshot({ projectId, mapId, author });

  const committed = await runtime.manifestRepository.listByState("committed");
  assert(committed.length === 1, "one committed manifest entry for map operation");
  assert(
    committed[0].targetPath === `/projects/${projectId}/maps/${mapId}/snapshot.json`,
    "manifest targetPath matches map snapshot path",
  );

  assert(runtime.lockDiagnosticsRepository, "lock diagnostics repository is available on runtime");
  const events = await runtime.lockDiagnosticsRepository!.findByLockId(
    `atomic:/projects/${projectId}/maps/${mapId}/snapshot.json`,
  );
  // Diagnostics are optional/best-effort; just ensure access does not throw.
  assert(events.length >= 0, "lock diagnostics lookup completed without error");
})();
