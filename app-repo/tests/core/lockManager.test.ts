import { InMemoryLockManager, type LockId, type LockOwner } from "../../src/core/concurrency/LockManager";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

(async function run() {
  const mgr = new InMemoryLockManager();
  const lockId: LockId = { id: "project:proj-1" };
  const owner: LockOwner = { ownerId: "job-1" };

  const lock = await mgr.acquire(lockId, owner, "write");
  assert(lock.id === "project:proj-1", "lock id matches");
  assert(lock.ownerId === "job-1", "owner matches");

  let threw = false;
  try {
    await mgr.acquire(lockId, { ownerId: "job-2" }, "write");
  } catch {
    threw = true;
  }
  assert(threw, "second acquire should fail while lock held");

  const renewed = await mgr.renew(lock);
  assert(typeof renewed.heartbeatTs === "string" && renewed.heartbeatTs.length > 0, "heartbeat set on renew");

  await mgr.release(renewed);

  // After release, we should be able to acquire again.
  const lock2 = await mgr.acquire(lockId, owner, "write");
  assert(lock2.ownerId === owner.ownerId, "reacquire after release works");

  // Shared read locks: multiple readers allowed.
  const readLockId: LockId = { id: "project:proj-reads" };
  const readOwner1: LockOwner = { ownerId: "reader-1" };
  const readOwner2: LockOwner = { ownerId: "reader-2" };
  const readLock1 = await mgr.acquire(readLockId, readOwner1, "read");
  assert(readLock1.ownerId === readOwner1.ownerId, "first read lock acquired");
  const readLock2 = await mgr.acquire(readLockId, readOwner2, "read");
  assert(readLock2.ownerId === readOwner2.ownerId, "second read lock acquired concurrently");

  // Writer should be blocked while readers are present.
  let writeBlocked = false;
  try {
    await mgr.acquire(readLockId, { ownerId: "writer-while-reads" }, "write");
  } catch {
    writeBlocked = true;
  }
  assert(writeBlocked, "writer must be blocked when readers hold the lock");

  // If we reached here, basic lock semantics behave as expected.
})();
