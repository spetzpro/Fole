import { InMemoryDalContext } from "../../src/core/db/InMemoryDalContext";
import type { DbConnection } from "../../src/core/db/DalContext";
import { CoreRuntime } from "../../src/core/CoreRuntime";
import { ProjectDb } from "../../src/core/ProjectDb";
import { ProjectLocalSettingsRepository } from "../../src/core/ProjectLocalSettingsRepository";

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

async function testProjectLocalSettingsRepositoryUsesProjectDbAndHelpers() {
  const storageRoot = "/storage-project-local-settings";
  const runtime = new CoreRuntime({
    storageRoot,
    useInMemoryDal: true,
    lockDiagnosticsRepositoryCapacity: 10,
  });

  // Replace the project DB handle's connection with a recording connection.
  const dal = runtime.dal as InMemoryDalContext;
  const projectId = "proj-local-settings";
  const projectHandle: any = dal.getProjectDb(projectId);
  const recordingConn = new RecordingConnection();
  projectHandle.getConnection = async (): Promise<DbConnection> => recordingConn;

  const projectDb = new ProjectDb(runtime);
  const repo = new ProjectLocalSettingsRepository(projectDb);

  await repo.getSetting(projectId, "theme");
  await repo.upsertSetting(projectId, "theme", { mode: "dark" });

  assert(recordingConn.executed.length === 2, "expected two DAL operations (read + upsert)");

  const [selectOp, upsertOp] = recordingConn.executed;

  assert(
    selectOp.text.includes("FROM project_settings WHERE project_id = ? AND key = ?"),
    "getSetting must select from project_settings with project_id and key",
  );
  assert(
    JSON.stringify(selectOp.parameters) === JSON.stringify([projectId, "theme"]),
    "getSetting must bind projectId and key parameters",
  );

  assert(
    upsertOp.text.startsWith("INSERT INTO project_settings"),
    "upsertSetting must insert into project_settings",
  );
  assert(
    upsertOp.text.includes("ON CONFLICT(project_id, key) DO UPDATE"),
    "upsertSetting must use ON CONFLICT(project_id, key) DO UPDATE",
  );
  assert(
    JSON.stringify(upsertOp.parameters) === JSON.stringify([projectId, "theme", { mode: "dark" }]),
    "upsertSetting must bind projectId, key, and valueJson parameters",
  );
}

(async () => {
  await testProjectLocalSettingsRepositoryUsesProjectDbAndHelpers();
})();
