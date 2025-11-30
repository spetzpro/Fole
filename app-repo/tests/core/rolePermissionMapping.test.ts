import { deriveGlobalPermissionsForUser, type CurrentUser } from "@/core/permissions/PermissionModel";

function makeUser(roles: string[]): CurrentUser {
  return {
    id: "u1",
    displayName: "Test User",
    roles,
  };
}

describe("deriveGlobalPermissionsForUser", () => {
  it("returns empty array for null user", () => {
    expect(deriveGlobalPermissionsForUser(null)).toEqual([]);
  });

  it("grants minimal read-only permissions to VIEWER", () => {
    const user = makeUser(["VIEWER"]);
    const perms = deriveGlobalPermissionsForUser(user);
    expect(perms).toEqual(expect.arrayContaining(["projects.read", "files.read"]));
    expect(perms).not.toEqual(expect.arrayContaining(["projects.write", "files.write", "map.edit", "map.calibrate"]));
  });

  it("grants editor permissions for EDITOR", () => {
    const user = makeUser(["EDITOR"]);
    const perms = deriveGlobalPermissionsForUser(user);
    expect(perms).toEqual(
      expect.arrayContaining([
        "projects.read",
        "projects.write",
        "files.read",
        "files.write",
        "comments.create",
        "comments.edit",
        "comments.delete",
        "sketch.edit",
        "map.edit",
      ])
    );
    expect(perms).not.toEqual(expect.arrayContaining(["map.calibrate"]));
  });

  it("grants owner permissions for OWNER", () => {
    const user = makeUser(["OWNER"]);
    const perms = deriveGlobalPermissionsForUser(user);
    expect(perms).toEqual(
      expect.arrayContaining([
        "projects.read",
        "projects.write",
        "files.read",
        "files.write",
        "comments.create",
        "comments.edit",
        "comments.delete",
        "sketch.edit",
        "map.edit",
        "map.calibrate",
      ])
    );
  });

  it("grants admin permissions for ADMIN", () => {
    const user = makeUser(["ADMIN"]);
    const perms = deriveGlobalPermissionsForUser(user);
    expect(perms).toEqual(
      expect.arrayContaining([
        "projects.read",
        "projects.write",
        "files.read",
        "files.write",
        "comments.create",
        "comments.edit",
        "comments.delete",
        "sketch.edit",
        "map.edit",
        "map.calibrate",
      ])
    );
  });

  it("unions permissions for multiple roles", () => {
    const user = makeUser(["VIEWER", "ADMIN"]);
    const perms = deriveGlobalPermissionsForUser(user);
    expect(perms).toEqual(
      expect.arrayContaining([
        "projects.read",
        "projects.write",
        "files.read",
        "files.write",
        "map.calibrate",
      ])
    );
  });

  it("ignores non-canonical roles", () => {
    const user = makeUser(["CUSTOM_ROLE"]);
    const perms = deriveGlobalPermissionsForUser(user);
    expect(perms).toEqual([]);
  });
});
