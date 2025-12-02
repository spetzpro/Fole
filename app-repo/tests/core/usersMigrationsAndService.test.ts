import sqlite3 from "sqlite3";
import { CORE_INITIAL_MIGRATIONS } from "../../src/core/db/migrations/CoreInitialMigrations";
import { MigrationPlanner } from "../../src/core/db/migrations/MigrationPlanner";
import { MigrationSqlGenerator } from "../../src/core/db/migrations/MigrationSqlGenerator";
import { createUserService } from "../../src/core/identity/UserService";
import type { User } from "../../src/core/identity/UserService";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function applyCoreMigrationsToInMemoryDb(): Promise<sqlite3.Database> {
  const db = new sqlite3.Database(":memory:");

  const planner = new MigrationPlanner({ engine: "sqlite" });
  const plan = planner.plan(CORE_INITIAL_MIGRATIONS);
  const generator = new MigrationSqlGenerator("sqlite");
  const sql = generator.generate(plan).statements;

  await new Promise<void>((resolve, reject) => {
    db.serialize(() => {
      for (const stmt of sql) {
        db.run(stmt, (err) => {
          if (err) {
            reject(err);
          }
        });
      }
      resolve();
    });
  });

  return db;
}

async function testUsersTableSchema() {
  const db = await applyCoreMigrationsToInMemoryDb();

  await new Promise<void>((resolve, reject) => {
    db.all("PRAGMA table_info('users')", (err, rows) => {
      if (err) return reject(err);
      const names = rows.map((r: any) => r.name);
      assert(names.includes("id"), "users table should have id column");
      assert(names.includes("email"), "users table should have email column");
      assert(names.includes("user_external_id"), "users table should have user_external_id column");
      assert(names.includes("created_at"), "users table should have created_at column");
      resolve();
    });
  });
}

async function testUserServiceCreateAndLookup() {
  const db = await applyCoreMigrationsToInMemoryDb();

  // Monkey-patch getCoreDb to return our in-memory DB instance.
  const coreDbModule = require("../../src/core/storage/CoreDb");
  coreDbModule.getCoreDb = () => db;

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
}

(async () => {
  await testUsersTableSchema();
  await testUserServiceCreateAndLookup();
})();
