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

  assert(plan.ordered.length === 4, "Expected four core initial migrations");
  assert(plan.ordered[0].id === "20251123-001-create-users", "First core migration should be users");
  assert(plan.ordered[1].id === "20251123-002-create-projects", "Second core migration should be projects");
  assert(
    plan.ordered[2].id === "20251202-003-bootstrap-users-identity-fields",
    "Third core migration should be users identity bootstrap",
  );
  assert(plan.ordered[3].id === "20251203-004-create-invites", "Fourth core migration should be invites");
}

async function testProjectDbInitialMigrationsShape() {
  const planner = new MigrationPlanner({ engine: "sqlite" });
  const plan = planner.plan(PROJECT_DB_INITIAL_MIGRATIONS);

  assert(plan.ordered.length === 5, "Expected five project DB initial migrations");
  assert(plan.ordered[0].id === "20251123-101-create-maps", "First project DB migration should be maps");
  assert(plan.ordered[1].id === "20251201-201-create-map-calibrations", "Second project DB migration should be map_calibrations");
  assert(plan.ordered[2].id === "20251201-301-create-project-members", "Third project DB migration should be project_members");
  assert(plan.ordered[3].id === "20251202-401-create-files", "Fourth project DB migration should be files");
  assert(plan.ordered[4].id === "20251202-402-create-comments", "Fifth project DB migration should be comments");
}

(async () => {
  await testCoreInitialMigrationsShape();
  await testProjectDbInitialMigrationsShape();
})();
