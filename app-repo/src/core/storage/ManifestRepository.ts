import { ManifestEntry, ManifestState } from "./StoragePaths";

export interface ManifestRepository {
  createPending(entry: Omit<ManifestEntry, "id" | "state" | "createdAt" | "committedAt" | "commitTxId">): Promise<ManifestEntry>;
  markCommitted(id: number, commitTxId: number, committedAtIso: string): Promise<ManifestEntry | undefined>;
  markAborted(id: number, committedAtIso: string): Promise<ManifestEntry | undefined>;
  getById(id: number): Promise<ManifestEntry | undefined>;
  listByState(state: ManifestState): Promise<ManifestEntry[]>;
}

export class InMemoryManifestRepository implements ManifestRepository {
  private nextId = 1;
  private readonly entries = new Map<number, ManifestEntry>();

  async createPending(
    input: Omit<ManifestEntry, "id" | "state" | "createdAt" | "committedAt" | "commitTxId">,
  ): Promise<ManifestEntry> {
    const id = this.nextId++;
    const nowIso = new Date().toISOString();
    const entry: ManifestEntry = {
      ...input,
      id,
      state: "pending",
      createdAt: nowIso,
    };
    this.entries.set(id, entry);
    return entry;
  }

  async markCommitted(id: number, commitTxId: number, committedAtIso: string): Promise<ManifestEntry | undefined> {
    const existing = this.entries.get(id);
    if (!existing) return undefined;
    if (existing.state !== "pending") return existing;
    const updated: ManifestEntry = {
      ...existing,
      state: "committed",
      committedAt: committedAtIso,
      commitTxId,
    };
    this.entries.set(id, updated);
    return updated;
  }

  async markAborted(id: number, committedAtIso: string): Promise<ManifestEntry | undefined> {
    const existing = this.entries.get(id);
    if (!existing) return undefined;
    if (existing.state !== "pending") return existing;
    const updated: ManifestEntry = {
      ...existing,
      state: "aborted",
      committedAt: committedAtIso,
    };
    this.entries.set(id, updated);
    return updated;
  }

  async getById(id: number): Promise<ManifestEntry | undefined> {
    return this.entries.get(id);
  }

  async listByState(state: ManifestState): Promise<ManifestEntry[]> {
    const result: ManifestEntry[] = [];
    for (const entry of this.entries.values()) {
      if (entry.state === state) {
        result.push(entry);
      }
    }
    result.sort((a, b) => (a.id! - b.id!));
    return result;
  }
}
