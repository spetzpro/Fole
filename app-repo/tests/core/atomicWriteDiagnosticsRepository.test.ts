import { InMemoryAtomicWriteDiagnosticsRepository, RepositoryBackedAtomicWriteDiagnostics } from "../../src/core/storage/AtomicWriteDiagnosticsRepository";
import type { AtomicWriteDiagnosticsEvent } from "../../src/core/storage/AtomicWriteExecutor";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testInMemoryRepositoryStoresAndLimitsEvents() {
  const repo = new InMemoryAtomicWriteDiagnosticsRepository(3);

  const baseEvent: AtomicWriteDiagnosticsEvent = {
    targetPath: "/tmp/fole/projects/p1/maps/m1/final",
    author: "test-author",
    startedAt: Date.now(),
    finishedAt: Date.now(),
    durationMs: 1,
    stepsExecuted: ["acquire_lock", "write_files", "release_lock"],
    status: "success",
  };

  repo.append({ ...baseEvent, targetPath: "path-1" });
  repo.append({ ...baseEvent, targetPath: "path-2" });
  repo.append({ ...baseEvent, targetPath: "path-3" });
  repo.append({ ...baseEvent, targetPath: "path-4" });

  const recent = repo.getRecent(10);

  assert(recent.length === 3, "Repository should retain only the last maxEvents events");
  assert(recent[0].targetPath === "path-4", "Most recent event should be first");
  assert(recent[2].targetPath === "path-2", "Oldest retained event should be last in returned array");
}

async function testRepositoryBackedDiagnosticsAppendsEvents() {
  const repo = new InMemoryAtomicWriteDiagnosticsRepository(10);
  const diagnostics = new RepositoryBackedAtomicWriteDiagnostics(repo);

  const event: AtomicWriteDiagnosticsEvent = {
    targetPath: "diag-path",
    author: "diag-author",
    startedAt: Date.now(),
    finishedAt: Date.now(),
    durationMs: 5,
    stepsExecuted: ["acquire_lock", "commit_tx", "release_lock"],
    status: "success",
  };

  diagnostics.onAtomicWriteComplete(event);

  const recent = repo.getRecent(1);
  assert(recent.length === 1, "Repository should contain one event after diagnostics call");
  assert(recent[0].targetPath === "diag-path", "Stored event should match the diagnostics event");
}

(async () => {
  await testInMemoryRepositoryStoresAndLimitsEvents();
  await testRepositoryBackedDiagnosticsAppendsEvents();
})();
