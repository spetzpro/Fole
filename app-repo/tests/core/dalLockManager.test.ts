import { InMemoryDalContext } from "../../src/core/db/InMemoryDalContext";
import { DalLockManager, type LockId, type LockOwner } from "../../src/core/concurrency/LockManager";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

(async function run() {
  const dal = new InMemoryDalContext();
  const mgr = new DalLockManager({ dal });

  const lockId: LockId = { id: "project:proj-dal" };
  const owner: LockOwner = { ownerId: "job-1" };

  const lock = await mgr.acquire(lockId, owner, "write");
  assert(lock.id === lockId.id, "lock id matches");
  assert(lock.ownerId === owner.ownerId, "owner matches");

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

  const lock2 = await mgr.acquire(lockId, owner, "write");
  assert(lock2.ownerId === owner.ownerId, "reacquire after release works");

  const readLockId: LockId = { id: "project:proj-dal-reads" };
  const readOwner1: LockOwner = { ownerId: "reader-1" };
  const readOwner2: LockOwner = { ownerId: "reader-2" };
  const readLock1 = await mgr.acquire(readLockId, readOwner1, "read");
  assert(readLock1.ownerId === readOwner1.ownerId, "first read lock acquired");
  const readLock2 = await mgr.acquire(readLockId, readOwner2, "read");
  assert(readLock2.ownerId === readOwner2.ownerId, "second read lock acquired concurrently");

  let writeBlocked = false;
  try {
    await mgr.acquire(readLockId, { ownerId: "writer-while-reads" }, "write");
  } catch {
    writeBlocked = true;
  }
  assert(writeBlocked, "writer must be blocked when readers hold the lock");
})();
