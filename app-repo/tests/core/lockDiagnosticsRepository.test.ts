import {
  InMemoryLockDiagnosticsRepository,
  RepositoryBackedLockDiagnostics,
} from "../../src/core/concurrency/LockDiagnosticsRepository";
import type { LockDiagnosticsEvent } from "../../src/core/concurrency/LockManager";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

(async function run() {
  const repo = new InMemoryLockDiagnosticsRepository(3);

  const base: Omit<LockDiagnosticsEvent, "operation"> = {
    id: "lock-1",
    type: "write",
    timestamp: new Date().toISOString(),
  };

  await repo.append({ ...base, operation: "acquire" });
  await repo.append({ ...base, operation: "renew" });
  await repo.append({ ...base, operation: "release" });
  await repo.append({ ...base, operation: "acquire-failed", errorMessage: "conflict" });

  const recent = await repo.listRecent(2);
  assert(recent.length === 2, "listRecent returns requested number of items");
  assert(recent[0].operation === "acquire-failed", "most recent event first");
  assert(recent[1].operation === "release", "second most recent next");

  const byLock = await repo.findByLockId("lock-1");
  assert(byLock.length === 3, "capacity limits stored events");
  assert(byLock[0].operation === "acquire-failed", "byLock ordered most recent first");

  const failures = await repo.findFailures();
  assert(failures.length === 1, "only failure events returned");
  assert(failures[0].operation === "acquire-failed", "failure operation matches");

  const repo2 = new InMemoryLockDiagnosticsRepository(10);
  const adapter = new RepositoryBackedLockDiagnostics(repo2);

  const event: LockDiagnosticsEvent = {
    id: "lock-adapter",
    type: "read",
    operation: "acquire",
    timestamp: new Date().toISOString(),
  };

  await adapter.onLockEvent(event);

  const adapterEvents = await repo2.listRecent(10);
  assert(adapterEvents.length === 1, "adapter forwards event to repository");
  assert(adapterEvents[0].id === "lock-adapter", "adapter event lock id matches");
})();
