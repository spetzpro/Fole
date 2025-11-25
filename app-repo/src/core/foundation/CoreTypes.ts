export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export interface AppError {
  code: string;
  message: string;
  details?: unknown;
  cause?: unknown;
}

export type Maybe<T> = T | null | undefined;
