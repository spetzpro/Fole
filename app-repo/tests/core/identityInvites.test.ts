import { getCoreDb } from "../../src/core/storage/CoreDb";
import { CORE_INITIAL_MIGRATIONS } from "../../src/core/db/migrations/CoreInitialMigrations";
import { createInviteService } from "../../src/core/identity/InviteService";
import { createUserService } from "../../src/core/identity/UserService";
import { MigrationSqlGenerator } from "../../src/core/db/migrations/MigrationSqlGenerator";

function runCoreMigrations() {
  const db = getCoreDb();
  const generator = new MigrationSqlGenerator();

  for (const migration of CORE_INITIAL_MIGRATIONS) {
    const sqlStatements = generator.generateSql(migration.up);
    for (const sql of sqlStatements) {
      db.run(sql);
    }
  }
}

describe("Identity Invites MVP", () => {
  beforeAll(() => {
    runCoreMigrations();
  });

  test("createInvite normalizes email and persists invite", async () => {
    const inviteService = createInviteService();
    const email = " TestUser@Example.com ";

    const result = await inviteService.createInvite(email);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const invite = result.value;
    expect(invite.email).toBe("testuser@example.com");
    expect(invite.token).toBeTruthy();
    expect(invite.acceptedAt).toBeNull();

    const db = getCoreDb();
    await new Promise<void>((resolve, reject) => {
      db.get(
        "SELECT id, email, token, created_at, accepted_at, created_by_user_id FROM invites WHERE id = ?",
        [invite.id],
        (err, row) => {
          if (err) return reject(err);
          expect(row).toBeDefined();
          expect(row.email).toBe("testuser@example.com");
          expect(row.accepted_at).toBeNull();
          resolve();
        },
      );
    });
  });

  test("acceptInvite happy path creates user and marks invite accepted", async () => {
    const inviteService = createInviteService();
    const userService = createUserService();

    const createResult = await inviteService.createInvite("invitee@example.com");
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const token = createResult.value.token;

    const acceptResult = await inviteService.acceptInvite(token);
    expect(acceptResult.ok).toBe(true);
    if (!acceptResult.ok) return;

    const { invite, user } = acceptResult.value;
    expect(invite.acceptedAt).not.toBeNull();
    expect(user.email).toBe("invitee@example.com");

    const userLookup = await userService.getUserByEmail("invitee@example.com");
    expect(userLookup.ok).toBe(true);
    if (!userLookup.ok) return;
    expect(userLookup.value).not.toBeNull();
    expect(userLookup.value!.email).toBe("invitee@example.com");
  });

  test("acceptInvite called again returns INVITE_ALREADY_ACCEPTED", async () => {
    const inviteService = createInviteService();

    const createResult = await inviteService.createInvite("second@example.com");
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const token = createResult.value.token;

    const firstAccept = await inviteService.acceptInvite(token);
    expect(firstAccept.ok).toBe(true);
    if (!firstAccept.ok) return;

    const secondAccept = await inviteService.acceptInvite(token);
    expect(secondAccept.ok).toBe(false);
    if (secondAccept.ok) return;

    expect(secondAccept.error.code).toBe("INVITE_ALREADY_ACCEPTED");
    expect(secondAccept.error.message).toBe("Invite has already been accepted");
    expect(secondAccept.error.details).toHaveProperty("inviteId");
    expect(secondAccept.error.details).toHaveProperty("token");
  });

  test("acceptInvite on unknown token returns INVITE_NOT_FOUND", async () => {
    const inviteService = createInviteService();

    const result = await inviteService.acceptInvite("non-existent-token");
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("INVITE_NOT_FOUND");
    expect(result.error.message).toBe("Invite not found");
    expect(result.error.details).toEqual({ token: "non-existent-token" });
  });
});
