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

  const projectId = "proj-map-metadata-flow";
  const mapId = "map-metadata-flow";
  const author = "core-flow-tester";

  await ops.commitMapMetadata({ projectId, mapId, author });

  const committed = await runtime.manifestRepository.listByState("committed");
  assert(committed.length === 1, "one committed manifest entry for map metadata operation");
  assert(
    committed[0].targetPath === `/projects/${projectId}/maps/${mapId}/metadata.json`,
    "manifest targetPath matches map metadata path",
  );
  assert(
    committed[0].opType === "map_metadata_write",
    "manifest opType matches map metadata write",
  );
})();
