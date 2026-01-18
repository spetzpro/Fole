import type { Result } from "../foundation/CoreTypes";
import type { AppError } from "../foundation/CoreTypes";
import { getCoreDb } from "../storage/CoreDb";
import { v4 as uuidv4 } from "uuid";

export interface User {
  userId: string;
  email: string;
  userExternalId: string;
  createdAt: string;
}

// Note: at the DB level, the users table uses `id` as the
// primary key column; this service treats that `id` as `userId`.

export interface UserService {
  createUserFromInvite(email: string): Promise<Result<User, AppError>>;
  getUserByEmail(email: string): Promise<Result<User | null, AppError>>;
  getUserById(userId: string): Promise<Result<User | null, AppError>>;
}

export function createUserService(): UserService {
  const db = getCoreDb();

  async function mapRow(row: any): Promise<User> {
    return {
      userId: row.id,
      email: row.email,
      userExternalId: row.user_external_id,
      createdAt: row.created_at,
    };
  }

  return {
    async createUserFromInvite(email: string): Promise<Result<User, AppError>> {
      const normalizedEmail = email.trim().toLowerCase();

      const existing = await new Promise<any | undefined>((resolve, reject) => {
        db.get(
          "SELECT id, email, user_external_id, created_at FROM users WHERE email = ?",
          [normalizedEmail],
          (err: Error | null, row: any) => {
            if (err) return reject(err);
            resolve(row ?? undefined);
          },
        );
      }).catch((err: any) => ({ __dbError: err } as any));

      if ((existing as any)?.__dbError) {
        const err = (existing as any).__dbError;
        return {
          ok: false,
          error: {
            code: "DB_ERROR",
            message: "Failed to query users table",
            details: { cause: String(err) },
          },
        };
      }

      if (existing) {
        // Chosen behavior: if a user with this email already exists,
        // return the existing user instead of treating it as an error.
        const user = await mapRow(existing);
        return { ok: true, value: user };
      }

      const userId = uuidv4();
      const userExternalId = normalizedEmail;
      const createdAt = new Date().toISOString();

      const insertResult = await new Promise<any | undefined>((resolve, reject) => {
        db.run(
          "INSERT INTO users (id, email, user_external_id, created_at) VALUES (?, ?, ?, ?)",
          [userId, normalizedEmail, userExternalId, createdAt],
          function (err: Error | null) {
            if (err) return reject(err);
            resolve(undefined);
          },
        );
      }).catch((err: any) => ({ __dbError: err } as any));

      if ((insertResult as any)?.__dbError) {
        const err = (insertResult as any).__dbError;
        return {
          ok: false,
          error: {
            code: "DB_ERROR",
            message: "Failed to insert user",
            details: { cause: String(err) },
          },
        };
      }

      return {
        ok: true,
        value: {
          userId,
          email: normalizedEmail,
          userExternalId,
          createdAt,
        },
      };
    },

    async getUserByEmail(email: string): Promise<Result<User | null, AppError>> {
      const normalizedEmail = email.trim().toLowerCase();
      const row = await new Promise<any | undefined>((resolve, reject) => {
        db.get(
          "SELECT id, email, user_external_id, created_at FROM users WHERE email = ?",
          [normalizedEmail],
          (err: Error | null, data: any) => {
            if (err) return reject(err);
            resolve(data ?? undefined);
          },
        );
      }).catch((err: any) => ({ __dbError: err } as any));

      if ((row as any)?.__dbError) {
        const err = (row as any).__dbError;
        return {
          ok: false,
          error: {
            code: "DB_ERROR",
            message: "Failed to query users table by email",
            details: { cause: String(err) },
          },
        };
      }

      if (!row) {
        return { ok: true, value: null };
      }

      const user = await mapRow(row);
      return { ok: true, value: user };
    },

    async getUserById(userId: string): Promise<Result<User | null, AppError>> {
      const row = await new Promise<any | undefined>((resolve, reject) => {
        db.get(
          "SELECT id, email, user_external_id, created_at FROM users WHERE id = ?",
          [userId],
          (err: Error | null, data: any) => {
            if (err) return reject(err);
            resolve(data ?? undefined);
          },
        );
      }).catch((err: any) => ({ __dbError: err } as any));

      if ((row as any)?.__dbError) {
        const err = (row as any).__dbError;
        return {
          ok: false,
          error: {
            code: "DB_ERROR",
            message: "Failed to query users table by id",
            details: { cause: String(err) },
          },
        };
      }

      if (!row) {
        return { ok: true, value: null };
      }

      const user = await mapRow(row);
      return { ok: true, value: user };
    },
  };
}
