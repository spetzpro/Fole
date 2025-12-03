import type { Result } from "../foundation/CoreTypes";
import type { AppError } from "../foundation/Errors";
import type { User, UserService } from "./UserService";
import { getCurrentUserProvider } from "../auth/CurrentUserProvider";

export async function resolveCurrentUserUser(userService: UserService): Promise<Result<User | null, AppError>> {
  const currentUser = getCurrentUserProvider().getCurrentUser();
  if (!currentUser) {
    return { ok: true, value: null };
  }

  const byId = await userService.getUserById(currentUser.id);
  if (!byId.ok) return byId;
  if (byId.value) {
    return { ok: true, value: byId.value };
  }

  if (currentUser.email) {
    const byEmail = await userService.getUserByEmail(currentUser.email);
    if (!byEmail.ok) return byEmail;
    if (byEmail.value) {
      return { ok: true, value: byEmail.value };
    }
  }

  return { ok: true, value: null };
}
