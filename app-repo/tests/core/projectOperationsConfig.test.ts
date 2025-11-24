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

  const projectId = "proj-config-flow";
  const author = "core-flow-tester";

  await ops.commitProjectConfig({ projectId, author });

  const committed = await runtime.manifestRepository.listByState("committed");
  assert(committed.length === 1, "one committed manifest entry for project config operation");
  assert(
    committed[0].targetPath === `/projects/${projectId}/config.json`,
    "manifest targetPath matches project config path",
  );
  assert(
    committed[0].opType === "project_config_write",
    "manifest opType matches project config write",
  );
})();
