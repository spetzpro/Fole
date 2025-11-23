import type { LockDiagnostics, LockDiagnosticsEvent } from "./LockManager";

export interface LockDiagnosticsRepository {
  append(event: LockDiagnosticsEvent): Promise<void>;
  listRecent(limit: number): Promise<LockDiagnosticsEvent[]>;
  findByLockId(lockId: string, limit?: number): Promise<LockDiagnosticsEvent[]>;
  findFailures(limit?: number): Promise<LockDiagnosticsEvent[]>;
  findByOwner(ownerId: string, limit?: number): Promise<LockDiagnosticsEvent[]>;
}

export class InMemoryLockDiagnosticsRepository implements LockDiagnosticsRepository {
  private readonly capacity: number;
  private readonly events: LockDiagnosticsEvent[] = [];

  constructor(capacity: number) {
    if (capacity <= 0) {
      throw new Error("capacity must be positive");
    }
    this.capacity = capacity;
  }

  async append(event: LockDiagnosticsEvent): Promise<void> {
    this.events.push(event);
    if (this.events.length > this.capacity) {
      this.events.splice(0, this.events.length - this.capacity);
    }
  }

  async listRecent(limit: number): Promise<LockDiagnosticsEvent[]> {
    const slice = this.events.slice(-limit);
    return [...slice].reverse();
  }

  async findByLockId(lockId: string, limit?: number): Promise<LockDiagnosticsEvent[]> {
    const filtered = this.events.filter((e) => e.id === lockId);
    const slice = typeof limit === "number" ? filtered.slice(-limit) : filtered;
    return [...slice].reverse();
  }

  async findFailures(limit?: number): Promise<LockDiagnosticsEvent[]> {
    const failures = this.events.filter((e) => e.operation.endsWith("-failed"));
    const slice = typeof limit === "number" ? failures.slice(-limit) : failures;
    return [...slice].reverse();
  }

  async findByOwner(ownerId: string, limit?: number): Promise<LockDiagnosticsEvent[]> {
    const filtered = this.events.filter((e) => e.ownerId === ownerId);
    const slice = typeof limit === "number" ? filtered.slice(-limit) : filtered;
    return [...slice].reverse();
  }
}

export class RepositoryBackedLockDiagnostics implements LockDiagnostics {
  private readonly repository: LockDiagnosticsRepository;

  constructor(repository: LockDiagnosticsRepository) {
    this.repository = repository;
  }

  async onLockEvent(event: LockDiagnosticsEvent): Promise<void> {
    await this.repository.append(event);
  }
}
