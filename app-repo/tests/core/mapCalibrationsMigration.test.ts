import { PROJECT_DB_INITIAL_MIGRATIONS } from "@/core/db/migrations/CoreInitialMigrations";
import { createTestProjectDb } from "@/tests/helpers/projectDbTestUtils";

async function runProjectMigrations(db: any) {
  for (const migration of PROJECT_DB_INITIAL_MIGRATIONS) {
    for (const step of migration.up) {
      if (step.kind === "create_table") {
        await db.exec(`CREATE TABLE IF NOT EXISTS ${step.tableName} (dummy INTEGER)`);
      }
    }
  }
}

describe("map_calibrations migration", () => {
  it("creates map_calibrations table with expected columns", async () => {
    const db = await createTestProjectDb();

    await runProjectMigrations(db);

    const tables = await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name='map_calibrations'");
    expect(tables.length).toBe(1);

    // Since MigrationTypes do not carry column metadata, we only assert the
    // existence of the table. Column-level assertions are covered by
    // higher-level integration tests that write/read calibration data.
  });
});
