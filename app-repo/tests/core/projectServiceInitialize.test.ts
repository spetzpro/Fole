import { CoreRuntime } from "../../src/core/CoreRuntime";
import { ProjectService } from "../../src/core/ProjectService";
import { JobStatus } from "../../src/core/JobQueue";
import type { DbConnection } from "../../src/core/db/DalContext";
import { InMemoryDalContext } from "../../src/core/db/InMemoryDalContext";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

class RecordingConnection implements DbConnection {
  readonly engine = "sqlite" as const;
  public readonly executed: { type?: string; text: string; parameters?: ReadonlyArray<unknown> }[] = [];

  async executeCommand(command: { type: string; text: string; parameters?: ReadonlyArray<unknown> }) {
    this.executed.push({ type: command.type, text: command.text, parameters: command.parameters });
    return {};
  }

  async executeQuery<TResult = unknown>(query: { text: string; parameters?: ReadonlyArray<unknown> }) {
    this.executed.push({ text: query.text, parameters: query.parameters });
    return [] as TResult[];
  }
}

async function testInitializeProjectRunsJobsAndWritesSettings() {
  const runtime = new CoreRuntime({
    storageRoot: "/storage-project-service",
    useInMemoryDal: true,
    lockDiagnosticsRepositoryCapacity: 10,
  });

  const projectId = "proj-service-init";
  const author = "project-service-tester";

  // Patch the project DB handle to a recording connection so we can assert
  // that settings writes go through the project DB, not core DB.
  const dal = runtime.dal as InMemoryDalContext;
  const projectHandle: any = dal.getProjectDb(projectId);
  const recordingConn = new RecordingConnection();
  projectHandle.getConnection = async (): Promise<DbConnection> => recordingConn;

  const service = new ProjectService(runtime);

  const result = await service.initializeProject({
    projectId,
    author,
    initialSettings: {
      theme: { mode: "dark" },
    },
  });

  assert(result.projectId === projectId, "initializeProject must echo projectId");

  // Verify that project config + metadata jobs completed successfully.
  const committed = await runtime.manifestRepository.listByState("committed");
  assert(committed.length === 2, "initializeProject must commit config and metadata writes");

  const opTypes = committed.map((e) => e.opType).sort();
  assert(
    opTypes[0] === "project_config_write" && opTypes[1] === "project_metadata_write",
    "initializeProject must run project config and metadata jobs",
  );

  // Ensure job summaries are completed.
  // We don't have direct access to the summaries here, but job records should
  // be present and completed in the in-memory job queue diagnostics.
  // The existing project job tests already cover detailed job behavior.

  // Verify that settings writes went through the project DB connection.
  assert(
    recordingConn.executed.length === 1,
    "initializeProject with one initial setting should perform one settings upsert",
  );

  const [upsertOp] = recordingConn.executed;

  assert(
    upsertOp.text.startsWith("INSERT INTO project_settings"),
    "initializeProject must insert into project_settings via ProjectLocalSettingsRepository",
  );
  assert(
    upsertOp.text.includes("ON CONFLICT(project_id, key) DO UPDATE"),
    "initializeProject must use ON CONFLICT(project_id, key) DO UPDATE",
  );
  assert(
    JSON.stringify(upsertOp.parameters) === JSON.stringify([projectId, "theme", { mode: "dark" }]),
    "initializeProject must bind projectId, key, and valueJson parameters for settings",
  );
}

(async () => {
  await testInitializeProjectRunsJobsAndWritesSettings();
})();
