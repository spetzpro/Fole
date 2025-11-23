import { MigrationPlanner } from "../../src/core/db/migrations/MigrationPlanner";
import type { MigrationDefinition } from "../../src/core/db/migrations/MigrationTypes";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testMigrationPlannerOrdersAndFilters() {
  const migrations: MigrationDefinition[] = [
    {
      id: "20251123-002-create-projects",
      title: "Create projects table",
      engine: "any",
      safety: "non_destructive",
      up: [
        { kind: "create_table", tableName: "projects" },
      ],
      down: [
        { kind: "drop_table", tableName: "projects" },
      ],
    },
    {
      id: "20251123-001-create-users",
      title: "Create users table",
      engine: "any",
      safety: "non_destructive",
      up: [
        { kind: "create_table", tableName: "users" },
      ],
      down: [
        { kind: "drop_table", tableName: "users" },
      ],
    },
    {
      id: "20251123-003-add-postgres-only-index",
      title: "Postgres-only index",
      engine: "postgres",
      safety: "non_destructive",
      up: [
        { kind: "add_column", tableName: "users", columnName: "dummy" },
      ],
      down: [
        { kind: "drop_column", tableName: "users", columnName: "dummy" },
      ],
    },
  ];

  const sqlitePlanner = new MigrationPlanner({ engine: "sqlite" });
  const sqlitePlan = sqlitePlanner.plan(migrations);

  assert(sqlitePlan.ordered.length === 2, "SQLite plan should include only 'any' engine migrations");
  assert(
    sqlitePlan.ordered[0].id === "20251123-001-create-users" &&
      sqlitePlan.ordered[1].id === "20251123-002-create-projects",
    "SQLite plan should be ordered by id ascending",
  );

  const postgresPlanner = new MigrationPlanner({ engine: "postgres" });
  const postgresPlan = postgresPlanner.plan(migrations);

  assert(postgresPlan.ordered.length === 3, "Postgres plan should include 'any' and 'postgres' migrations");
  assert(
    postgresPlan.ordered[0].id === "20251123-001-create-users" &&
      postgresPlan.ordered[1].id === "20251123-002-create-projects" &&
      postgresPlan.ordered[2].id === "20251123-003-add-postgres-only-index",
    "Postgres plan should include all relevant migrations in order",
  );
}

async function testMigrationPlannerDuplicateIdThrows() {
  const migrations: MigrationDefinition[] = [
    {
      id: "dup-id",
      title: "First",
      engine: "any",
      safety: "non_destructive",
      up: [],
      down: [],
    },
    {
      id: "dup-id",
      title: "Second",
      engine: "any",
      safety: "non_destructive",
      up: [],
      down: [],
    },
  ];

  const planner = new MigrationPlanner({ engine: "sqlite" });
  let threw = false;
  try {
    planner.plan(migrations);
  } catch (err) {
    threw = true;
  }
  assert(threw, "Planner should throw on duplicate migration ids");
}

(async () => {
  await testMigrationPlannerOrdersAndFilters();
  await testMigrationPlannerDuplicateIdThrows();
})();
