import { MigrationPlanner } from "../../src/core/db/migrations/MigrationPlanner";
import { CORE_INITIAL_MIGRATIONS, PROJECT_DB_INITIAL_MIGRATIONS } from "../../src/core/db/migrations/CoreInitialMigrations";
import { MigrationSqlGenerator } from "../../src/core/db/migrations/MigrationSqlGenerator";

function assert(condition: any, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testGeneratesSqliteSqlForInitialMigrations() {
  const planner = new MigrationPlanner({ engine: "sqlite" });
  const planCore = planner.plan(CORE_INITIAL_MIGRATIONS);
  const planProject = planner.plan(PROJECT_DB_INITIAL_MIGRATIONS);

  const generator = new MigrationSqlGenerator("sqlite");
  const coreSql = generator.generate(planCore.ordered);
  const projectSql = generator.generate(planProject.ordered);

  assert(coreSql.engine === "sqlite", "engine must be sqlite");
  const hasUsersTableCreate = coreSql.statements.some((s) =>
    s.startsWith("CREATE TABLE IF NOT EXISTS users"),
  );
  const hasProjectsTableCreate = coreSql.statements.some((s) =>
    s.startsWith("CREATE TABLE IF NOT EXISTS projects"),
  );
  assert(hasUsersTableCreate, "users table create SQL must be present");
  assert(hasProjectsTableCreate, "projects table create SQL must be present");

  const projectCreateTables = projectSql.statements.filter((s) =>
    s.startsWith("CREATE TABLE IF NOT EXISTS"),
  );

  const hasMaps = projectCreateTables.some((s) =>
    s.startsWith("CREATE TABLE IF NOT EXISTS maps"),
  );
  const hasMapCalibrations = projectCreateTables.some((s) =>
    s.startsWith("CREATE TABLE IF NOT EXISTS map_calibrations"),
  );
  const hasProjectMembers = projectCreateTables.some((s) =>
    s.startsWith("CREATE TABLE IF NOT EXISTS project_members"),
  );
  const hasFiles = projectCreateTables.some((s) =>
    s.startsWith("CREATE TABLE IF NOT EXISTS files"),
  );
  const hasComments = projectCreateTables.some((s) =>
    s.startsWith("CREATE TABLE IF NOT EXISTS comments"),
  );

  const filesSchemaHasRequiredColumns = projectSql.statements.some((s) =>
    s.startsWith("CREATE TABLE IF NOT EXISTS files") &&
    s.includes("storage_key TEXT NOT NULL") &&
    s.includes("filename TEXT NOT NULL") &&
    s.includes("size_bytes INTEGER NOT NULL") &&
    s.includes("metadata_json TEXT"),
  );
  const commentsSchemaHasRequiredColumns = projectSql.statements.some((s) =>
    s.startsWith("CREATE TABLE IF NOT EXISTS comments") &&
    s.includes("target_type TEXT NOT NULL") &&
    s.includes("target_id TEXT NOT NULL") &&
    s.includes("author_user_id TEXT NOT NULL") &&
    s.includes("attachments_json TEXT") &&
    s.includes("metadata_json TEXT"),
  );

  assert(hasMaps, "maps table create SQL must be present");
  assert(hasMapCalibrations, "map_calibrations table create SQL must be present");
  assert(hasProjectMembers, "project_members table create SQL must be present");
  assert(hasFiles, "files table create SQL must be present");
  assert(hasComments, "comments table create SQL must be present");
  assert(filesSchemaHasRequiredColumns, "files table SQL must include required MVP columns");
  assert(commentsSchemaHasRequiredColumns, "comments table SQL must include required MVP columns");
}

async function testGeneratesPostgresSqlForInitialMigrations() {
  const planner = new MigrationPlanner({ engine: "postgres" });
  const planCore = planner.plan(CORE_INITIAL_MIGRATIONS);

  const generator = new MigrationSqlGenerator("postgres");
  const coreSql = generator.generate(planCore.ordered);

  assert(coreSql.engine === "postgres", "engine must be postgres");
  const hasUsersUuidId = coreSql.statements.some((s) =>
    s.includes("CREATE TABLE IF NOT EXISTS users") && s.includes("id uuid PRIMARY KEY"),
  );
  assert(hasUsersUuidId, "users id type must be uuid in postgres");
}

(async () => {
  await testGeneratesSqliteSqlForInitialMigrations();
  await testGeneratesPostgresSqlForInitialMigrations();
})();
