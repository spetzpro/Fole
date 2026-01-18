import type { Result } from "../foundation/CoreTypes";
import type { AppError } from "../foundation/CoreTypes";
import { getCoreDb } from "../storage/CoreDb";
import { v4 as uuidv4 } from "uuid";
import type { User } from "./UserService";
import { createUserService } from "./UserService";

export interface Invite {
  id: string;
  email: string;
  token: string;
  createdAt: string;
  acceptedAt: string | null;
  createdByUserId?: string | null;
}

export interface InviteService {
  createInvite(email: string): Promise<Result<Invite, AppError>>;
  acceptInvite(token: string): Promise<
    Result<
      {
        invite: Invite;
        user: User;
      },
      AppError
    >
  >;
}

export function createInviteService(): InviteService {
  const db = getCoreDb();
  const userService = createUserService();

  async function mapRow(row: any): Promise<Invite> {
    return {
      id: row.id,
      email: row.email,
      token: row.token,
      createdAt: row.created_at,
      acceptedAt: row.accepted_at ?? null,
      createdByUserId: row.created_by_user_id ?? null,
    };
  }

  return {
    async createInvite(email: string): Promise<Result<Invite, AppError>> {
      const normalizedEmail = email.trim().toLowerCase();
      const id = uuidv4();
      const token = uuidv4();
      const createdAt = new Date().toISOString();
      const acceptedAt: string | null = null;
      const createdByUserId: string | null = null;

      const insertResult = await new Promise<any | undefined>((resolve, reject) => {
        db.run(
          "INSERT INTO invites (id, email, token, created_at, accepted_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)",
          [id, normalizedEmail, token, createdAt, acceptedAt, createdByUserId],
          function (err) {
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
            message: "Failed to insert invite",
            details: { cause: String(err) },
          },
        };
      }

      return {
        ok: true,
        value: {
          id,
          email: normalizedEmail,
          token,
          createdAt,
          acceptedAt,
          createdByUserId,
        },
      };
    },

    async acceptInvite(token: string): Promise<
      Result<
        {
          invite: Invite;
          user: User;
        },
        AppError
      >
    > {
      const inviteRow = await new Promise<any | undefined>((resolve, reject) => {
        db.get(
          "SELECT id, email, token, created_at, accepted_at, created_by_user_id FROM invites WHERE token = ?",
          [token],
          (err, row) => {
            if (err) return reject(err);
            resolve(row ?? undefined);
          },
        );
      }).catch((err: any) => ({ __dbError: err } as any));

      if ((inviteRow as any)?.__dbError) {
        const err = (inviteRow as any).__dbError;
        return {
          ok: false,
          error: {
            code: "DB_ERROR",
            message: "Failed to query invites table by token",
            details: { cause: String(err) },
          },
        };
      }

      if (!inviteRow) {
        return {
          ok: false,
          error: {
            code: "INVITE_NOT_FOUND",
            message: "Invite not found",
            details: { token },
          },
        };
      }

      if (inviteRow.accepted_at) {
        return {
          ok: false,
          error: {
            code: "INVITE_ALREADY_ACCEPTED",
            message: "Invite has already been accepted",
            details: { inviteId: inviteRow.id, token },
          },
        };
      }

      const userResult = await userService.createUserFromInvite(inviteRow.email);
      if (!userResult.ok) {
        return userResult;
      }

      const acceptedAt = new Date().toISOString();

      const updateResult = await new Promise<any | undefined>((resolve, reject) => {
        db.run(
          "UPDATE invites SET accepted_at = ? WHERE id = ?",
          [acceptedAt, inviteRow.id],
          function (err) {
            if (err) return reject(err);
            resolve(undefined);
          },
        );
      }).catch((err: any) => ({ __dbError: err } as any));

      if ((updateResult as any)?.__dbError) {
        const err = (updateResult as any).__dbError;
        return {
          ok: false,
          error: {
            code: "DB_ERROR",
            message: "Failed to update invite as accepted",
            details: { cause: String(err) },
          },
        };
      }

      const updatedInviteRow = await new Promise<any | undefined>((resolve, reject) => {
        db.get(
          "SELECT id, email, token, created_at, accepted_at, created_by_user_id FROM invites WHERE id = ?",
          [inviteRow.id],
          (err, row) => {
            if (err) return reject(err);
            resolve(row ?? undefined);
          },
        );
      }).catch((err: any) => ({ __dbError: err } as any));

      if ((updatedInviteRow as any)?.__dbError) {
        const err = (updatedInviteRow as any).__dbError;
        return {
          ok: false,
          error: {
            code: "DB_ERROR",
            message: "Failed to reload invite after acceptance",
            details: { cause: String(err) },
          },
        };
      }

      const invite = await mapRow(updatedInviteRow ?? inviteRow);

      return {
        ok: true,
        value: {
          invite,
          user: userResult.value,
        },
      };
    },
  };
}
