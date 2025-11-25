export interface DiagnosticEvent {
  category: string;
  type: string;
  timestamp: string;
  level?: "debug" | "info" | "warn" | "error";
  correlationId?: string;
  data?: Record<string, unknown>;
}

export interface DiagnosticsHub {
  emit(event: DiagnosticEvent): void;
  subscribe(listener: (e: DiagnosticEvent) => void): () => void;
}

let currentHub: DiagnosticsHub | null = null;

export function initDiagnosticsHub(hub: DiagnosticsHub): void {
  currentHub = hub;
}

export function getDiagnosticsHub(): DiagnosticsHub {
  if (!currentHub) {
    return {
      emit: () => {
        // no-op
      },
      subscribe: () => () => {
        // no-op unsubscribe
      },
    };
  }
  return currentHub;
}

export function emitDiagnostic(event: DiagnosticEvent): void {
  try {
    const hub = getDiagnosticsHub();
    const normalized: DiagnosticEvent = {
      ...event,
      timestamp: event.timestamp ?? new Date().toISOString(),
    };
    hub.emit(normalized);
  } catch {
    // Diagnostics must never throw.
  }
}
