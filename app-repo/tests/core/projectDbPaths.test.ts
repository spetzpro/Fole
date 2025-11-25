import { CoreRuntime } from "../../src/core/CoreRuntime";
import { ProjectDb } from "../../src/core/ProjectDb";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testProjectDbPathMatchesSpecLayoutAndOpensConnection() {
  const runtime = new CoreRuntime({
    storageRoot: "/storage-project-db",
    useInMemoryDal: true,
    lockDiagnosticsRepositoryCapacity: 10,
  });

  const projectId = "proj-db-path-contract";
  const projectDb = new ProjectDb(runtime);

  const paths = projectDb.getProjectDbPath(projectId);

  assert(paths.projectId === projectId, "projectId must round-trip in ProjectDbPaths");
  assert(
    paths.dbPath === `/projects/${projectId}/project.db`,
    "project.db path must match STORAGE_ROOT/projects/<projectId>/project.db",
  );

  const conn = await projectDb.getConnection(projectId);
  assert(conn.engine === "sqlite", "in-memory DAL must expose sqlite engine for project DB");
}

(async () => {
  await testProjectDbPathMatchesSpecLayoutAndOpensConnection();
})();
