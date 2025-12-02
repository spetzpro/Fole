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

  const fakeDb = new FakeDb();

  // Monkey-patch getCoreDb to return our FakeDb instance.
  const CoreDbModule = await import("app/core/storage/CoreDb");
  const originalGetCoreDb = CoreDbModule.getCoreDb;
  (CoreDbModule as any).getCoreDb = () => fakeDb;

  const service = createUserService();

  const email = "TestUser@example.com";

  const createdResult = await service.createUserFromInvite(email);
  assert(createdResult.ok, "createUserFromInvite should succeed for new email");
  const createdUser = createdResult.value as User;
  assert(createdUser.email === email.toLowerCase(), "email should be normalized to lowercase");
  assert(createdUser.userExternalId === createdUser.email, "userExternalId should equal email in MVP");

  const byEmail = await service.getUserByEmail(email);
  assert(byEmail.ok, "getUserByEmail should succeed");
  assert(byEmail.value && byEmail.value.userId === createdUser.userId, "getUserByEmail should return created user");

  const byId = await service.getUserById(createdUser.userId);
  assert(byId.ok, "getUserById should succeed");
  assert(byId.value && byId.value.email === createdUser.email, "getUserById should return created user");

  // Calling createUserFromInvite again with the same email should return the existing user (by design).
  const secondResult = await service.createUserFromInvite(email);
  assert(secondResult.ok, "createUserFromInvite should succeed for existing email");
  assert(secondResult.value && secondResult.value.userId === createdUser.userId, "existing user should be returned for duplicate email");

  // Restore original getCoreDb
  (CoreDbModule as any).getCoreDb = originalGetCoreDb;
}

(async () => {
  await testUsersTableSchema();
  await testUserServiceCreateAndLookup();
})();
