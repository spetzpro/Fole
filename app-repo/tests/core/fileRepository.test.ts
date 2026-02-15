import type { DbCommand, DbCommandResult, DbConnection, DbEngine, DbQuery } from "../../src/core/db/DalContext";
import { createFileRepository } from "../../src/feature/files/FileRepository";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

type FileRow = {
  id: string;
  project_id: string;
  storage_key: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  metadata_json: string | null;
  created_at: string;
  created_by: string;
};

class FakeDbConnection implements DbConnection {
  readonly engine: DbEngine = "sqlite";
  private readonly files: FileRow[] = [];

  async executeCommand(command: DbCommand): Promise<DbCommandResult> {
    if (command.text.startsWith("INSERT INTO files")) {
      const p = command.parameters ?? [];
      this.files.push({
        id: String(p[0]),
        project_id: String(p[1]),
        storage_key: String(p[2]),
        filename: String(p[3]),
        mime_type: String(p[4]),
        size_bytes: Number(p[5]),
        metadata_json: (p[6] as string | null) ?? null,
        created_at: String(p[7]),
        created_by: String(p[8]),
      });
      return { rowsAffected: 1 };
    }
    throw new Error(`Unsupported command in FakeDbConnection: ${command.text}`);
  }

  async executeQuery<TResult = unknown>(query: DbQuery): Promise<ReadonlyArray<TResult>> {
    if (query.text.includes("FROM files WHERE project_id = ? AND id = ?")) {
      const projectId = String(query.parameters?.[0]);
      const fileId = String(query.parameters?.[1]);
      return this.files.filter((row) => row.project_id === projectId && row.id === fileId) as unknown as TResult[];
    }

    if (query.text.includes("FROM files WHERE project_id = ? ORDER BY created_at ASC, id ASC")) {
      const projectId = String(query.parameters?.[0]);
      const rows = this.files
        .filter((row) => row.project_id === projectId)
        .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id.localeCompare(b.id)));
      return rows as unknown as TResult[];
    }

    throw new Error(`Unsupported query in FakeDbConnection: ${query.text}`);
  }
}

async function testFileRepositoryCreateGetList() {
  const fakeConn = new FakeDbConnection();
  const fakeProjectDb = {
    getConnection: async (_projectId: string) => fakeConn,
  } as any;

  const repository = createFileRepository(fakeProjectDb);

  const created = await repository.create("proj-file-repo", {
    storageKey: "projects/proj-file-repo/files/file-a.bin",
    filename: "file-a.bin",
    mimeType: "application/octet-stream",
    sizeBytes: 2048,
    metadata: { source: "test" },
    createdBy: "user-1",
    createdAt: "2026-02-15T00:00:00.000Z",
  });

  const loaded = await repository.get("proj-file-repo", created.id);
  assert(loaded != null, "created file must be loadable");
  assert(loaded?.filename === "file-a.bin", "loaded filename must match");
  assert(loaded?.sizeBytes === 2048, "loaded size_bytes must match");
  assert(loaded?.metadata?.source === "test", "loaded metadata must round-trip");

  const list = await repository.list("proj-file-repo");
  assert(list.length === 1, "list(project) must return inserted file");
  assert(list[0].id === created.id, "listed file id must match inserted record");
}

(async () => {
  await testFileRepositoryCreateGetList();
})();
