# Module: core.foundation.DiagnosticsHub

## 1. Purpose
Provide a non-fatal diagnostic event hub for internal debugging.

## 2. Responsibilities
- Emit diagnostic events
- Allow listeners to subscribe
- Never throw errors

## 3. DiagnosticEvent Shape
~~~ts
export interface DiagnosticEvent {
  category: string;
  type: string;
  timestamp: string;
  level?: "debug" | "info" | "warn" | "error";
  correlationId?: string;
  data?: Record<string, unknown>;
}
~~~

## 4. Public API (MVP)
~~~ts
export function initDiagnosticsHub(hub: {
  emit(event: DiagnosticEvent): void;
  subscribe(listener: (e: DiagnosticEvent) => void): () => void;
}): void;

export function getDiagnosticsHub(): {
  emit(event: DiagnosticEvent): void;
  subscribe(listener: (e: DiagnosticEvent) => void): () => void;
};

export function emitDiagnostic(event: DiagnosticEvent): void;
~~~

## 5. Behavior
- emit() never throws
- Listeners are isolated with try/catch
- Default hub is no-op if not initialized

## 6. Example
~~~ts
emitDiagnostic({
  category: "lock",
  type: "lock_acquired",
  timestamp: new Date().toISOString(),
  data: { resourceId }
});
~~~
