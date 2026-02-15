import type { DbCommand, DbCommandResult, DbConnection, DbEngine, DbQuery } from "../../src/core/db/DalContext";
import { createCommentRepository } from "../../src/feature/comments/CommentRepository";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

type CommentRow = {
  id: string;
  project_id: string;
  target_type: string;
  target_id: string;
  author_user_id: string;
  body: string;
  attachments_json: string | null;
  metadata_json: string | null;
  created_at: string;
};

class FakeDbConnection implements DbConnection {
  readonly engine: DbEngine = "sqlite";
  private readonly comments: CommentRow[] = [];

  async executeCommand(command: DbCommand): Promise<DbCommandResult> {
    if (command.text.startsWith("INSERT INTO comments")) {
      const p = command.parameters ?? [];
      this.comments.push({
        id: String(p[0]),
        project_id: String(p[1]),
        target_type: String(p[2]),
        target_id: String(p[3]),
        author_user_id: String(p[4]),
        body: String(p[5]),
        attachments_json: (p[6] as string | null) ?? null,
        metadata_json: (p[7] as string | null) ?? null,
        created_at: String(p[8]),
      });
      return { rowsAffected: 1 };
    }
    throw new Error(`Unsupported command in FakeDbConnection: ${command.text}`);
  }

  async executeQuery<TResult = unknown>(query: DbQuery): Promise<ReadonlyArray<TResult>> {
    if (query.text.includes("FROM comments WHERE project_id = ? AND id = ?")) {
      const projectId = String(query.parameters?.[0]);
      const commentId = String(query.parameters?.[1]);
      return this.comments.filter((row) => row.project_id === projectId && row.id === commentId) as unknown as TResult[];
    }

    if (query.text.includes("FROM comments WHERE project_id = ? AND target_type = ? AND target_id = ? ORDER BY created_at ASC, id ASC")) {
      const projectId = String(query.parameters?.[0]);
      const targetType = String(query.parameters?.[1]);
      const targetId = String(query.parameters?.[2]);
      const rows = this.comments
        .filter((row) => row.project_id === projectId && row.target_type === targetType && row.target_id === targetId)
        .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id.localeCompare(b.id)));
      return rows as unknown as TResult[];
    }

    throw new Error(`Unsupported query in FakeDbConnection: ${query.text}`);
  }
}

async function testCommentRepositoryCreateAndListByTarget() {
  const fakeConn = new FakeDbConnection();
  const fakeProjectDb = {
    getConnection: async (_projectId: string) => fakeConn,
  } as any;

  const repository = createCommentRepository(fakeProjectDb);

  const created = await repository.create("proj-comment-repo", {
    targetType: "file",
    targetId: "file-123",
    authorUserId: "user-7",
    body: "Looks good",
    attachments: ["file-attachment-1"],
    metadata: { severity: "info" },
    createdAt: "2026-02-15T00:00:00.000Z",
  });

  const loaded = await repository.get("proj-comment-repo", created.id);
  assert(loaded != null, "created comment must be loadable");
  assert(loaded?.targetType === "file", "loaded target_type must match");
  assert(loaded?.targetId === "file-123", "loaded target_id must match");
  assert(loaded?.attachments.length === 1, "attachments must round-trip");

  const list = await repository.listByTarget("proj-comment-repo", "file", "file-123");
  assert(list.length === 1, "listByTarget(project,targetType,targetId) must return inserted comment");
  assert(list[0].id === created.id, "listed comment id must match inserted record");
}

(async () => {
  await testCommentRepositoryCreateAndListByTarget();
})();
