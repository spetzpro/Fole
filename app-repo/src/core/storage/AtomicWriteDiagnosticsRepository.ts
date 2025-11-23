import type { AtomicWriteDiagnostics, AtomicWriteDiagnosticsEvent } from "./AtomicWriteExecutor";

export interface AtomicWriteDiagnosticsRepository {
  append(event: AtomicWriteDiagnosticsEvent): void;
  getRecent(limit: number): readonly AtomicWriteDiagnosticsEvent[];
}

export class InMemoryAtomicWriteDiagnosticsRepository implements AtomicWriteDiagnosticsRepository {
  private readonly maxEvents: number;
  private readonly events: AtomicWriteDiagnosticsEvent[] = [];

  constructor(maxEvents: number = 1000) {
    this.maxEvents = maxEvents;
  }

  append(event: AtomicWriteDiagnosticsEvent): void {
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.splice(0, this.events.length - this.maxEvents);
    }
  }

  getRecent(limit: number): readonly AtomicWriteDiagnosticsEvent[] {
    if (limit <= 0) {
      return [];
    }
    const start = Math.max(0, this.events.length - limit);
    return this.events.slice(start).reverse();
  }
}

export class RepositoryBackedAtomicWriteDiagnostics implements AtomicWriteDiagnostics {
  private readonly repository: AtomicWriteDiagnosticsRepository;

  constructor(repository: AtomicWriteDiagnosticsRepository) {
    this.repository = repository;
  }

  onAtomicWriteComplete(event: AtomicWriteDiagnosticsEvent): void {
    this.repository.append(event);
  }
}
