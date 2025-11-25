import {
	DiagnosticEvent,
	initDiagnosticsHub,
	getDiagnosticsHub,
	emitDiagnostic,
} from "../../src/core/foundation/DiagnosticsHub";

function runDiagnosticsHubTests(): void {
	// Default hub is no-op and should not throw.
	const defaultHub = getDiagnosticsHub();
	defaultHub.emit({
		category: "test",
		type: "default_noop",
		timestamp: new Date().toISOString(),
	});

	// Install a real hub and ensure emit/subscribe work and never throw.
	const events: DiagnosticEvent[] = [];

	initDiagnosticsHub({
		emit(event: DiagnosticEvent): void {
			try {
				events.push(event);
			} catch (err) {
				// Diagnostics must never throw; swallow any unexpected errors.
			}
		},
		subscribe(listener: (e: DiagnosticEvent) => void): () => void {
			for (const e of events) {
				try {
					listener(e);
				} catch (err) {
					// Listener failures must not escape diagnostics.
				}
			}
			return () => {
				// no-op
			};
		},
	});

	emitDiagnostic({
		category: "test",
		type: "event_one",
		timestamp: new Date().toISOString(),
		data: { a: 1 },
	});

	emitDiagnostic({
		category: "test",
		type: "event_two",
		timestamp: new Date().toISOString(),
	});

	// Ensure events were captured.
	if (events.length !== 2) {
		throw new Error(`Expected 2 diagnostic events, got ${events.length}`);
	}

	// emitDiagnostic should never throw even if listeners fail.
	// We simulate a failing listener; any thrown error must be contained
	// inside the diagnostics implementation.
	const hub = getDiagnosticsHub();
	hub.subscribe(() => {
		throw new Error("listener failed");
	});

	emitDiagnostic({
		category: "test",
		type: "event_three",
		timestamp: new Date().toISOString(),
	});
}

runDiagnosticsHubTests();
