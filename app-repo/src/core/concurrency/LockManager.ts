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

export interface LockAcquireRetryOptions extends LockAcquireOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
}

export async function acquireWithRetry(
  manager: LockManager,
  lock: LockId,
  owner: LockOwner,
  type: LockType,
  options?: LockAcquireRetryOptions,
): Promise<AcquiredLock> {
  const maxAttempts = options?.maxAttempts ?? 5;
  const initialDelayMs = options?.initialDelayMs ?? 25;
  const maxDelayMs = options?.maxDelayMs ?? 500;

  let attempt = 0;
  let delay = initialDelayMs;

  // Simple bounded exponential backoff loop.
  for (;;) {
    try {
      return await manager.acquire(lock, owner, type, options);
    } catch (err) {
      attempt += 1;
      if (attempt >= maxAttempts) {
        throw err;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 2, maxDelayMs);
  }
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

export interface DalLockManagerDeps {
  readonly dal: import("../db/DalContext").DalContext;
  readonly tableName?: string;
}

export class DalLockManager implements LockManager {
  private readonly dal: import("../db/DalContext").DalContext;
  private readonly tableName: string;

  constructor(deps: DalLockManagerDeps) {
    this.dal = deps.dal;
    this.tableName = deps.tableName ?? "dal_locks";
  }

  async acquire(lock: LockId, owner: LockOwner, type: LockType, options?: LockAcquireOptions): Promise<AcquiredLock> {
    const db = this.dal.getCoreDb();
    const now = new Date();
    const leaseSeconds = options?.leaseDurationSeconds ?? 30;
    const leaseExpires = new Date(now.getTime() + leaseSeconds * 1000).toISOString();
    const heartbeatTs = now.toISOString();

    return db.runInTransaction(async (conn) => {
      const rows = await conn.executeQuery<{ owner: string; lease_expires: string; type: string }>(
        {
          text: `SELECT owner, lease_expires, metadata, type FROM ${this.tableName} WHERE lock_id = ?`,
          parameters: [lock.id],
        },
      );

      if (rows.length > 0) {
        const existing = rows[0];
        const existingExpires = new Date(existing.lease_expires).getTime();
        if (existingExpires > now.getTime()) {
          if (type === "read" && (existing as any).type === "read") {
            // allowed shared read; fall through and update row
          } else {
            throw new Error(`lock already held: ${lock.id}`);
          }
        }

        await conn.executeCommand({
          type: "update",
          text: `UPDATE ${this.tableName} SET owner = ?, lease_expires = ?, heartbeat_ts = ?, metadata = ? WHERE lock_id = ?`,
          parameters: [owner.ownerId, leaseExpires, heartbeatTs, JSON.stringify(options?.metadata ?? null), lock.id],
        });
      } else {
        await conn.executeCommand({
          type: "insert",
          text: `INSERT INTO ${this.tableName} (lock_id, owner, lease_expires, heartbeat_ts, metadata, type) VALUES (?, ?, ?, ?, ?, ?)`,
          parameters: [
            lock.id,
            owner.ownerId,
            leaseExpires,
            heartbeatTs,
            JSON.stringify(options?.metadata ?? null),
            type,
          ],
        });
      }

      return {
        id: lock.id,
        ownerId: owner.ownerId,
        type,
        leaseExpires,
        heartbeatTs,
        metadata: options?.metadata,
      };
    });
  }

  async renew(lock: AcquiredLock): Promise<AcquiredLock> {
    const db = this.dal.getCoreDb();
    const now = new Date();
    const leaseSeconds = 30;
    const leaseExpires = new Date(now.getTime() + leaseSeconds * 1000).toISOString();
    const heartbeatTs = now.toISOString();

    return db.runInTransaction(async (conn) => {
      const rows = await conn.executeQuery<{ owner: string }>(
        {
          text: `SELECT owner FROM ${this.tableName} WHERE lock_id = ?`,
          parameters: [lock.id],
        },
      );

      if (rows.length === 0 || rows[0].owner !== lock.ownerId) {
        throw new Error(`cannot renew lock not held by owner: ${lock.id}`);
      }

      await conn.executeCommand({
        type: "update",
        text: `UPDATE ${this.tableName} SET lease_expires = ?, heartbeat_ts = ? WHERE lock_id = ?`,
        parameters: [leaseExpires, heartbeatTs, lock.id],
      });

      return {
        ...lock,
        leaseExpires,
        heartbeatTs,
      };
    });
  }

  async release(lock: AcquiredLock): Promise<void> {
    const db = this.dal.getCoreDb();
    await db.runInTransaction(async (conn) => {
      const rows = await conn.executeQuery<{ owner: string }>(
        {
          text: `SELECT owner FROM ${this.tableName} WHERE lock_id = ?`,
          parameters: [lock.id],
        },
      );

      if (rows.length === 0 || rows[0].owner !== lock.ownerId) {
        throw new Error(`cannot release lock not held by owner: ${lock.id}`);
      }

      await conn.executeCommand({
        type: "delete",
        text: `DELETE FROM ${this.tableName} WHERE lock_id = ?`,
        parameters: [lock.id],
      });
    });
  }
}

export interface LockManagerFactoryOptions {
  readonly useDal?: boolean;
  readonly dal?: import("../db/DalContext").DalContext;
  readonly tableName?: string;
}

export function createLockManager(options: LockManagerFactoryOptions = {}): LockManager {
  if (options.useDal) {
    if (!options.dal) {
      throw new Error("DalContext is required when useDal is true");
    }
    return new DalLockManager({ dal: options.dal, tableName: options.tableName });
  }
  return new InMemoryLockManager();
}
