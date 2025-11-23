import { MigrationPlanner } from "../../src/core/db/migrations/MigrationPlanner";
import { CORE_INITIAL_MIGRATIONS } from "../../src/core/db/migrations/CoreInitialMigrations";
import { SchemaDriftChecker } from "../../src/core/db/migrations/SchemaDriftChecker";
import sqlite3 from "sqlite3";
import * as fs from "fs";
import * as path from "path";

function assert(condition: any, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function createTempSqliteDb(createSql: string[]): Promise<string> {
  const tmpDir = fs.mkdtempSync(path.join(process.cwd(), "tmp-schema-drift-"));
  const dbPath = path.join(tmpDir, "test.db");
  await new Promise<void>((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    db.serialize(() => {
      for (const stmt of createSql) {
        db.run(stmt);
      }
    });
    db.close((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
  return dbPath;
}

async function testSchemaMatchesPlan() {
  const planner = new MigrationPlanner({ engine: "sqlite" });
  const plan = planner.plan(CORE_INITIAL_MIGRATIONS);

  const createSql = [
    "CREATE TABLE users (id TEXT PRIMARY KEY);",
    "CREATE TABLE projects (id TEXT PRIMARY KEY);",
  ];
  const dbPath = await createTempSqliteDb(createSql);

  const checker = new SchemaDriftChecker();
  const snapshot = await checker.snapshotSqlite(dbPath);
  const report = checker.compare(plan.ordered, snapshot);

  assert(report.missingTables.length === 0, "no missing tables when schema matches");
  assert(report.extraTables.length === 0, "no extra tables when schema matches");
}

async function testSchemaDriftDetected() {
  const planner = new MigrationPlanner({ engine: "sqlite" });
  const plan = planner.plan(CORE_INITIAL_MIGRATIONS);

  const createSql = [
    "CREATE TABLE users (id TEXT PRIMARY KEY);",
    "CREATE TABLE extra_table (id TEXT PRIMARY KEY);",
  ];
  const dbPath = await createTempSqliteDb(createSql);

  const checker = new SchemaDriftChecker();
  const snapshot = await checker.snapshotSqlite(dbPath);
  const report = checker.compare(plan.ordered, snapshot);

  assert(report.missingTables.includes("projects"), "projects table should be reported missing");
  assert(report.extraTables.includes("extra_table"), "extra_table should be reported as extra");
}

(async () => {
  await testSchemaMatchesPlan();
  await testSchemaDriftDetected();
  console.log("schemaDriftChecker tests passed");
})();
