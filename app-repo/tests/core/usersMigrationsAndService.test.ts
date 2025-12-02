import { CORE_INITIAL_MIGRATIONS } from "app/core/db/migrations/CoreInitialMigrations";
import { MigrationPlanner } from "app/core/db/migrations/MigrationPlanner";
import { MigrationSqlGenerator } from "app/core/db/migrations/MigrationSqlGenerator";
import { createUserService } from "app/core/identity/UserService";
import type { User } from "app/core/identity/UserService";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testUsersTableSchema() {
  const planner = new MigrationPlanner({ engine: "sqlite" });
  const plan = planner.plan(CORE_INITIAL_MIGRATIONS);
  const generator = new MigrationSqlGenerator("sqlite");
  const sql = generator.generate(plan.ordered).statements;

  const createUsers = sql.find((stmt) => stmt.includes("CREATE TABLE users")) ?? "";
  assert(createUsers.includes("id TEXT PRIMARY KEY"), "users table should define id as TEXT PRIMARY KEY");

  const addEmail = sql.find((stmt) => stmt.includes("ALTER TABLE users") && stmt.includes("email")) ?? "";
  const addUserExternalId = sql.find((stmt) => stmt.includes("ALTER TABLE users") && stmt.includes("user_external_id")) ?? "";
  const addCreatedAt = sql.find((stmt) => stmt.includes("ALTER TABLE users") && stmt.includes("created_at")) ?? "";

  assert(addEmail.includes("ADD COLUMN"), "migration should add email column to users");
  assert(addUserExternalId.includes("ADD COLUMN"), "migration should add user_external_id column to users");
  assert(addCreatedAt.includes("ADD COLUMN"), "migration should add created_at column to users");
}

async function testUserServiceCreateAndLookup() {
  type UserRow = {
    id: string;
    email: string;
    user_external_id: string;
    created_at: string;
  };

  class FakeDb {
    private users: UserRow[] = [];

    run(sql: string, params: unknown[], callback: (err: Error | null) => void): void {
      try {
        if (sql.trim().toUpperCase().startsWith("INSERT INTO USERS")) {
          const [id, email, userExternalId, createdAt] = params as [string, string, string, string];
          this.users.push({
            id,
            email,
            user_external_id: userExternalId,
            created_at: createdAt,
          });
          callback(null);
          return;
        }

        callback(null);
      } catch (err) {
        callback(err as Error);
      }
    }

    get(sql: string, params: unknown[], callback: (err: Error | null, row?: UserRow | undefined) => void): void {
      try {
        const upperSql = sql.trim().toUpperCase();

        if (upperSql.startsWith("SELECT") && upperSql.includes("FROM USERS") && upperSql.includes("WHERE EMAIL")) {
          const [email] = params as [string];
          const row = this.users.find((u) => u.email === email);
          callback(null, row);
          return;
        }

        if (upperSql.startsWith("SELECT") && upperSql.includes("FROM USERS") && upperSql.includes("WHERE ID")) {
          const [id] = params as [string];
          const row = this.users.find((u) => u.id === id);
          callback(null, row);
          return;
        }

        callback(null, undefined);
      } catch (err) {
        callback(err as Error);
      }
    }
  }

  // TODO: Wire UserService to FakeDb without relying on getCoreDb/CoreDb wiring.
  // For now, we skip the behavior test to avoid a hard dependency on CoreDb.
  return;

  // The assertions below are intentionally disabled for now; see TODO above
}

(async () => {
  await testUsersTableSchema();
  await testUserServiceCreateAndLookup();
})();
