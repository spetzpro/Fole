import type { Result } from "../../src/core/foundation/CoreTypes";
import type { AppError } from "../../src/core/foundation/Errors";
import type { CurrentUser, CurrentUserProvider } from "../../src/core/auth/CurrentUserTypes";
import { setCurrentUserProvider } from "../../src/core/auth/CurrentUserProvider";
import type { User, UserService } from "../../src/core/identity/UserService";
import { resolveCurrentUserUser } from "../../src/core/identity/CurrentUserIdentity";

function createStubUserService(overrides: Partial<UserService> = {}): UserService {
  const base: UserService = {
    async createUserFromInvite(email: string): Promise<Result<User, AppError>> {
      throw new Error(`Not implemented in stub: createUserFromInvite(${email})`);
    },
    async getUserByEmail(email: string): Promise<Result<User | null, AppError>> {
      throw new Error(`Not implemented in stub: getUserByEmail(${email})`);
    },
    async getUserById(userId: string): Promise<Result<User | null, AppError>> {
      throw new Error(`Not implemented in stub: getUserById(${userId})`);
    },
  };
  return { ...base, ...overrides };
}

function setStubCurrentUserProvider(currentUser: CurrentUser | null): void {
  const provider: CurrentUserProvider = {
    getCurrentUser(): CurrentUser | null {
      return currentUser;
    },
    isAuthenticated(): boolean {
      return currentUser !== null;
    },
  };
  setCurrentUserProvider(provider);
}

describe("resolveCurrentUserUser", () => {
  test("returns null when not authenticated and does not call UserService", async () => {
    let getUserByIdCalled = false;
    let getUserByEmailCalled = false;

    const userService = createStubUserService({
      async getUserById(userId: string): Promise<Result<User | null, AppError>> {
        getUserByIdCalled = true;
        return { ok: true, value: null };
      },
      async getUserByEmail(email: string): Promise<Result<User | null, AppError>> {
        getUserByEmailCalled = true;
        return { ok: true, value: null };
      },
    });

    setStubCurrentUserProvider(null);

    const result = await resolveCurrentUserUser(userService);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeNull();
    expect(getUserByIdCalled).toBe(false);
    expect(getUserByEmailCalled).toBe(false);
  });

  test("uses id lookup when authenticated and id matches a user", async () => {
    const user: User = {
      userId: "user-1",
      email: "u@example.com",
      userExternalId: "u@example.com",
      createdAt: new Date().toISOString(),
    };

    let getUserByIdCalledWith: string | null = null;
    let getUserByEmailCalled = false;

    const userService = createStubUserService({
      async getUserById(userId: string): Promise<Result<User | null, AppError>> {
        getUserByIdCalledWith = userId;
        return { ok: true, value: user };
      },
      async getUserByEmail(email: string): Promise<Result<User | null, AppError>> {
        getUserByEmailCalled = true;
        return { ok: true, value: null };
      },
    });

    const currentUser: CurrentUser = {
      id: "user-1",
      displayName: "Test User",
      email: "u@example.com",
      roles: ["USER"],
    };

    setStubCurrentUserProvider(currentUser);

    const result = await resolveCurrentUserUser(userService);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(user);
    expect(getUserByIdCalledWith).toBe("user-1");
    expect(getUserByEmailCalled).toBe(false);
  });

  test("falls back to email lookup when id has no matching user", async () => {
    const user: User = {
      userId: "user-2",
      email: "fallback@example.com",
      userExternalId: "fallback@example.com",
      createdAt: new Date().toISOString(),
    };

    let getUserByIdCalledWith: string | null = null;
    let getUserByEmailCalledWith: string | null = null;

    const userService = createStubUserService({
      async getUserById(userId: string): Promise<Result<User | null, AppError>> {
        getUserByIdCalledWith = userId;
        return { ok: true, value: null };
      },
      async getUserByEmail(email: string): Promise<Result<User | null, AppError>> {
        getUserByEmailCalledWith = email;
        return { ok: true, value: user };
      },
    });

    const currentUser: CurrentUser = {
      id: "missing-id",
      displayName: "Fallback User",
      email: "fallback@example.com",
      roles: ["USER"],
    };

    setStubCurrentUserProvider(currentUser);

    const result = await resolveCurrentUserUser(userService);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(user);
    expect(getUserByIdCalledWith).toBe("missing-id");
    expect(getUserByEmailCalledWith).toBe("fallback@example.com");
  });

  test("returns null when both id and email lookups miss", async () => {
    let getUserByIdCalledWith: string | null = null;
    let getUserByEmailCalledWith: string | null = null;

    const userService = createStubUserService({
      async getUserById(userId: string): Promise<Result<User | null, AppError>> {
        getUserByIdCalledWith = userId;
        return { ok: true, value: null };
      },
      async getUserByEmail(email: string): Promise<Result<User | null, AppError>> {
        getUserByEmailCalledWith = email;
        return { ok: true, value: null };
      },
    });

    const currentUser: CurrentUser = {
      id: "missing-id",
      displayName: "Unknown User",
      email: "unknown@example.com",
      roles: ["USER"],
    };

    setStubCurrentUserProvider(currentUser);

    const result = await resolveCurrentUserUser(userService);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeNull();
    expect(getUserByIdCalledWith).toBe("missing-id");
    expect(getUserByEmailCalledWith).toBe("unknown@example.com");
  });

  test("propagates DB errors from UserService", async () => {
    const userService = createStubUserService({
      async getUserById(userId: string): Promise<Result<User | null, AppError>> {
        return {
          ok: false,
          error: {
            code: "DB_ERROR",
            message: "Simulated DB failure",
            details: { userId },
          },
        };
      },
    });

    const currentUser: CurrentUser = {
      id: "user-err",
      displayName: "Error User",
      email: "error@example.com",
      roles: ["USER"],
    };

    setStubCurrentUserProvider(currentUser);

    const result = await resolveCurrentUserUser(userService);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DB_ERROR");
    expect(result.error.message).toBe("Simulated DB failure");
    expect(result.error.details).toEqual({ userId: "user-err" });
  });
});
