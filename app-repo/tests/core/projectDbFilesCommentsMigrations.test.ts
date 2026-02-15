import { PROJECT_DB_INITIAL_MIGRATIONS } from "../../src/core/db/migrations/CoreInitialMigrations";
import { MigrationPlanner } from "../../src/core/db/migrations/MigrationPlanner";
import { MigrationSqlGenerator } from "../../src/core/db/migrations/MigrationSqlGenerator";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function applyCreateTableStatements(statements: readonly string[]): Set<string> {
  const createdTables = new Set<string>();
  for (const statement of statements) {
    const normalized = statement.trim().toUpperCase();
    if (!normalized.startsWith("CREATE TABLE")) {
      continue;
    }

    const match = statement.match(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
    if (!match) {
      continue;
    }
    createdTables.add(match[1].toLowerCase());
  }
  return createdTables;
}

async function testProjectDbFilesAndCommentsTablesExistAfterMigrations() {
  const planner = new MigrationPlanner({ engine: "sqlite" });
  const plan = planner.plan(PROJECT_DB_INITIAL_MIGRATIONS);
  const sql = new MigrationSqlGenerator("sqlite").generate(plan.ordered);

  const createdOnce = applyCreateTableStatements(sql.statements);
  const createdTwice = applyCreateTableStatements([...sql.statements, ...sql.statements]);

  assert(createdOnce.has("files"), "files table must exist after project DB migrations");
  assert(createdOnce.has("comments"), "comments table must exist after project DB migrations");
  assert(createdTwice.has("files") && createdTwice.has("comments"), "running create-table migrations twice must remain idempotent");

  const filesSchema = sql.statements.find((s) => s.startsWith("CREATE TABLE IF NOT EXISTS files")) ?? "";
  const commentsSchema = sql.statements.find((s) => s.startsWith("CREATE TABLE IF NOT EXISTS comments")) ?? "";

  ["storage_key", "filename", "mime_type", "size_bytes", "metadata_json", "created_at", "created_by"].forEach((token) => {
    assert(filesSchema.includes(token), `files schema must include ${token}`);
  });

  ["target_type", "target_id", "author_user_id", "body", "attachments_json", "metadata_json", "created_at"].forEach((token) => {
    assert(commentsSchema.includes(token), `comments schema must include ${token}`);
  });
}

(async () => {
  await testProjectDbFilesAndCommentsTablesExistAfterMigrations();
})();
