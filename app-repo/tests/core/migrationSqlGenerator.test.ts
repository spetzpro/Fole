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
  assert(coreSql.statements.length === 2, "two CREATE TABLE statements for core");
  assert(coreSql.statements[0].startsWith("CREATE TABLE IF NOT EXISTS users"), "users table create SQL");
  assert(coreSql.statements[1].startsWith("CREATE TABLE IF NOT EXISTS projects"), "projects table create SQL");

  assert(projectSql.statements.length === 3, "three CREATE TABLE statements for project DB");
  assert(projectSql.statements[0].startsWith("CREATE TABLE IF NOT EXISTS maps"), "maps table create SQL");
  assert(projectSql.statements[1].startsWith("CREATE TABLE IF NOT EXISTS map_calibrations"), "map_calibrations table create SQL");
  assert(projectSql.statements[2].startsWith("CREATE TABLE IF NOT EXISTS project_members"), "project_members table create SQL");
}

async function testGeneratesPostgresSqlForInitialMigrations() {
  const planner = new MigrationPlanner({ engine: "postgres" });
  const planCore = planner.plan(CORE_INITIAL_MIGRATIONS);

  const generator = new MigrationSqlGenerator("postgres");
  const coreSql = generator.generate(planCore.ordered);

  assert(coreSql.engine === "postgres", "engine must be postgres");
  assert(coreSql.statements.length === 2, "two CREATE TABLE statements for core");
  assert(coreSql.statements[0].includes("id uuid PRIMARY KEY"), "users id type must be uuid in postgres");
}

(async () => {
  await testGeneratesSqliteSqlForInitialMigrations();
  await testGeneratesPostgresSqlForInitialMigrations();
  console.log("migrationSqlGenerator tests passed");
})();
