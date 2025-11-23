import { InMemoryDalContext } from "../../src/core/db/InMemoryDalContext";
import { ExampleProjectRegistryService } from "../../src/core/example/ExampleProjectRegistryService";
import type { DbConnection } from "../../src/core/db/DalContext";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

class RecordingConnection implements DbConnection {
  readonly engine = "sqlite" as const;
  public readonly executed: { text: string; parameters?: ReadonlyArray<unknown> }[] = [];

  async executeCommand(_command: { type: string; text: string; parameters?: ReadonlyArray<unknown> }) {
    this.executed.push({ text: _command.text, parameters: _command.parameters });
    return {};
  }

  async executeQuery<TResult = unknown>(_query: { text: string; parameters?: ReadonlyArray<unknown> }) {
    this.executed.push({ text: _query.text, parameters: _query.parameters });
    return [] as TResult[];
  }
}

async function testExampleProjectRegistryServiceUsesHelpers() {
  const dal = new InMemoryDalContext("sqlite");
  const service = new ExampleProjectRegistryService(dal);

  // Monkey-patch the core DB connection to a recording connection so we can
  // assert on the SQL text and parameters used by the helpers.
  const coreHandle = dal.getCoreDb() as any;
  const recordingConn = new RecordingConnection();
  coreHandle.getConnection = async (): Promise<DbConnection> => recordingConn;

  await service.listProjects();
  await service.getProjectById("project-1");
  await service.createProject({ id: "project-2", name: "Example" });

  assert(recordingConn.executed.length === 3, "Expected three DAL operations");
  assert(
    recordingConn.executed[0].text.includes("SELECT id, name FROM projects"),
    "listProjects should use SELECT from projects"
  );
  assert(
    recordingConn.executed[1].text.includes("SELECT id, name FROM projects WHERE id = ?"),
    "getProjectById should select with WHERE id = ?"
  );
  assert(
    recordingConn.executed[2].text.includes("INSERT INTO projects"),
    "createProject should insert into projects"
  );
}

(async () => {
  await testExampleProjectRegistryServiceUsesHelpers();
})();
