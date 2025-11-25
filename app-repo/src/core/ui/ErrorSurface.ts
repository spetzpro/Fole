import type { AppError } from "../foundation/CoreTypes";
import { getLogger } from "../foundation/Logger";
import { emitDiagnostic } from "../foundation/DiagnosticsHub";

export interface UiErrorNotification {
  id: string;
  message: string;
  details?: string;
}

export interface ErrorSurface {
  reportError(error: unknown): void;
  getNotifications(): UiErrorNotification[];
  clearAll(): void;
}

let globalErrorSurface: ErrorSurface | null = null;

export function getErrorSurface(): ErrorSurface {
  if (!globalErrorSurface) {
    globalErrorSurface = createErrorSurface();
  }
  return globalErrorSurface;
}

function createErrorSurface(): ErrorSurface {
  const logger = getLogger("core.ui.ErrorSurface");
  let notifications: UiErrorNotification[] = [];

  function normaliseError(error: unknown): { message: string; details?: string } {
    if (!error) return { message: "Unknown error" };

    if (typeof error === "string") return { message: error };

    const maybeAppError = error as Partial<AppError>;
    if (maybeAppError.code && maybeAppError.message) {
      return {
        message: maybeAppError.message,
        details: maybeAppError.code,
      };
    }

    if (error instanceof Error) {
      return {
        message: error.message,
        details: error.stack,
      };
    }

    try {
      return {
        message: "Unexpected error",
        details: JSON.stringify(error),
      };
    } catch {
      return { message: "Unexpected error" };
    }
  }

  function addNotification(error: unknown): void {
    const { message, details } = normaliseError(error);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    notifications = [...notifications, { id, message, details }];
  }

  return {
    reportError(error: unknown): void {
      try {
        logger.error("UI error", { error });
        emitDiagnostic({
          category: "ui",
          type: "error",
          timestamp: new Date().toISOString(),
          data: { error },
        });
      } catch {
        // Must never throw.
      }

      addNotification(error);
    },

    getNotifications(): UiErrorNotification[] {
      return notifications;
    },

    clearAll(): void {
      notifications = [];
    },
  };
}
