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

  // If we reached here, basic lock semantics behave as expected.
})();
