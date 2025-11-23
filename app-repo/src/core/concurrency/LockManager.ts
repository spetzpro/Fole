export type LockType = "read" | "write" | "upgradeable";

export interface LockId {
  /** Deterministic identifier, e.g., "project:<uuid>", "map:<projectId>:<mapId>". */
  id: string;
}

export interface LockOwner {
  /** Caller-defined identifier for the owner (service/user/job). */
  ownerId: string;
}

export interface LockLease {
  /** ISO8601 timestamp when the lease expires. */
  leaseExpires: string;
  /** ISO8601 timestamp of last heartbeat. */
  heartbeatTs: string;
}

export interface LockMetadata {
  /** Arbitrary JSON-safe metadata, serialized by implementation. */
  metadata?: unknown;
}

export interface AcquiredLock extends LockId, LockOwner, LockLease, LockMetadata {
  type: LockType;
}

export interface LockAcquireOptions extends LockMetadata {
  leaseDurationSeconds?: number;
}

export interface LockManager {
  acquire(lock: LockId, owner: LockOwner, type: LockType, options?: LockAcquireOptions): Promise<AcquiredLock>;
  renew(lock: AcquiredLock): Promise<AcquiredLock>;
  release(lock: AcquiredLock): Promise<void>;
}

/**
 * A simple in-memory LockManager implementation intended for tests and local
 * tooling only. This does NOT attempt to be distributed or durable; it
 * exists to exercise the concurrency spec at a small scale without touching
 * real DB tables.
 */
export class InMemoryLockManager implements LockManager {
  private locks = new Map<string, AcquiredLock>();

  async acquire(lock: LockId, owner: LockOwner, type: LockType, options?: LockAcquireOptions): Promise<AcquiredLock> {
    const now = new Date();
    const key = lock.id;
    const existing = this.locks.get(key);

    if (existing) {
      const existingExpired = new Date(existing.leaseExpires).getTime() <= now.getTime();

      if (!existingExpired) {
        // Enforce basic lock-type semantics: multiple readers allowed, writers exclusive.
        if (type === "read" && existing.type === "read") {
          // allow shared read; fall through below without throwing
        } else {
          throw new Error(`lock already held: ${key}`);
        }
      }
    }
    const leaseSeconds = options?.leaseDurationSeconds ?? 30;
    const leaseExpires = new Date(now.getTime() + leaseSeconds * 1000).toISOString();
    const heartbeatTs = now.toISOString();
    const acquired: AcquiredLock = {
      id: key,
      ownerId: owner.ownerId,
      type,
      leaseExpires,
      heartbeatTs,
      metadata: options?.metadata,
    };
    // For simplicity this implementation does not model separate rows for
    // multiple readers; instead, a single record represents "some reader"
    // or a single writer. This is sufficient for unit tests that exercise
    // basic concurrency semantics without a real DAL table.
    this.locks.set(key, acquired);
    return acquired;
  }

  async renew(lock: AcquiredLock): Promise<AcquiredLock> {
    const now = new Date();
    const existing = this.locks.get(lock.id);
    if (!existing || existing.ownerId !== lock.ownerId) {
      throw new Error(`cannot renew lock not held by owner: ${lock.id}`);
    }
    const leaseSeconds = 30;
    const leaseExpires = new Date(now.getTime() + leaseSeconds * 1000).toISOString();
    const updated: AcquiredLock = {
      ...existing,
      leaseExpires,
      heartbeatTs: now.toISOString(),
    };
    this.locks.set(lock.id, updated);
    return updated;
  }

  async release(lock: AcquiredLock): Promise<void> {
    const existing = this.locks.get(lock.id);
    if (!existing || existing.ownerId !== lock.ownerId) {
      throw new Error(`cannot release lock not held by owner: ${lock.id}`);
    }
    this.locks.delete(lock.id);
  }
}
