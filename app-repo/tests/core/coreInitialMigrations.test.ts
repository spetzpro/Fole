import { CORE_INITIAL_MIGRATIONS, PROJECT_DB_INITIAL_MIGRATIONS } from "../../src/core/db/migrations/CoreInitialMigrations";
import { MigrationPlanner } from "../../src/core/db/migrations/MigrationPlanner";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testCoreInitialMigrationsShape() {
  const planner = new MigrationPlanner({ engine: "sqlite" });
  const plan = planner.plan(CORE_INITIAL_MIGRATIONS);

  assert(plan.ordered.length === 2, "Expected two core initial migrations");
  assert(plan.ordered[0].id === "20251123-001-create-users", "First core migration should be users");
  assert(plan.ordered[1].id === "20251123-002-create-projects", "Second core migration should be projects");
}

async function testProjectDbInitialMigrationsShape() {
  const planner = new MigrationPlanner({ engine: "sqlite" });
  const plan = planner.plan(PROJECT_DB_INITIAL_MIGRATIONS);

  assert(plan.ordered.length === 1, "Expected one project DB initial migration");
  assert(plan.ordered[0].id === "20251123-101-create-maps", "Project DB migration should be maps");
}

(async () => {
  await testCoreInitialMigrationsShape();
  await testProjectDbInitialMigrationsShape();
})();
