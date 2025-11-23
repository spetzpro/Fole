import { CoreRuntime } from "../../src/core/CoreRuntime";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

(async function run() {
  const runtime = new CoreRuntime({
    storageRoot: "/storage",
    useInMemoryDal: true,
    useDalLocks: true,
    lockDiagnosticsRepositoryCapacity: 10,
  });

  assert(runtime.lockDiagnosticsRepository, "lockDiagnosticsRepository is created when capacity provided");

  const lockId = {
    id: "project:lock-diag-runtime",
  };

  const owner = {
    ownerId: "runtime-job",
  };

  // Trigger at least one lock acquisition via an atomic write.
  await runtime.atomicWriteService.executeAtomicWrite(lockId, owner, async () => {
    // no-op payload
  });

  const events = await runtime.lockDiagnosticsRepository!.listRecent(10);
  assert(events.length > 0, "diagnostics repository recorded at least one event");
  assert(events.some((e) => e.id === lockId.id), "event for the expected lock id present");
})();
