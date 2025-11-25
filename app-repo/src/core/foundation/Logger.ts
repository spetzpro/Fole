export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

const levelOrder: LogLevel[] = ["debug", "info", "warn", "error"];

let globalLogLevel: LogLevel = "info";

export function setGlobalLogLevel(level: LogLevel): void {
  if (!levelOrder.includes(level)) {
    return;
  }
  globalLogLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  const currentIndex = levelOrder.indexOf(globalLogLevel);
  const requestedIndex = levelOrder.indexOf(level);
  return requestedIndex >= currentIndex;
}

function safeLog(method: keyof Console, scope: string, level: LogLevel, message: string, meta?: unknown): void {
  if (!shouldLog(level)) return;

  try {
    const prefix = `[${scope}]`;
    if (meta !== undefined) {
      // eslint-disable-next-line no-console
      (console[method] as typeof console.log)(prefix, message, meta);
    } else {
      // eslint-disable-next-line no-console
      (console[method] as typeof console.log)(prefix, message);
    }
  } catch {
    // Logging must never throw.
  }
}

class ScopedLogger implements Logger {
  constructor(private readonly scope: string) {}

  debug(message: string, meta?: unknown): void {
    safeLog("debug", this.scope, "debug", message, meta);
  }

  info(message: string, meta?: unknown): void {
    safeLog("info", this.scope, "info", message, meta);
  }

  warn(message: string, meta?: unknown): void {
    safeLog("warn", this.scope, "warn", message, meta);
  }

  error(message: string, meta?: unknown): void {
    safeLog("error", this.scope, "error", message, meta);
  }
}

export function getLogger(scope: string): Logger {
  return new ScopedLogger(scope);
}
