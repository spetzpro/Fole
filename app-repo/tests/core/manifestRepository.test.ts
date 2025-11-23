import { InMemoryManifestRepository } from "../../src/core/storage/ManifestRepository";

function assert(condition: any, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function testCreateAndTransitionStates() {
  const repo = new InMemoryManifestRepository();

  const created = await repo.createPending({
    opType: "tile_write",
    targetPath: "/maps/1/tiles/1",
    tmpPath: "/tmp/1",
    expectedFiles: [],
    author: "test",
  });

  assert(created.id !== undefined, "created manifest must have id");
  assert(created.state === "pending", "initial state must be pending");

  const fetched = await repo.getById(created.id!);
  assert(fetched?.id === created.id, "getById must return created entry");

  const pendingList = await repo.listByState("pending");
  assert(pendingList.length === 1, "there must be one pending entry");

  const committedAt = new Date().toISOString();
  const committed = await repo.markCommitted(created.id!, 123, committedAt);
  assert(committed?.state === "committed", "state must be committed");
  assert(committed?.commitTxId === 123, "commitTxId must be set");

  const pendingAfter = await repo.listByState("pending");
  assert(pendingAfter.length === 0, "no pending entries after commit");
}

async function testAbortFlow() {
  const repo = new InMemoryManifestRepository();

  const created = await repo.createPending({
    opType: "map_import",
    targetPath: "/maps/2",
    tmpPath: "/tmp/2",
    expectedFiles: [],
    author: "test",
  });

  const abortedAt = new Date().toISOString();
  const aborted = await repo.markAborted(created.id!, abortedAt);
  assert(aborted?.state === "aborted", "state must be aborted");

  const pending = await repo.listByState("pending");
  assert(pending.length === 0, "no pending after abort");
}

(async () => {
  await testCreateAndTransitionStates();
  await testAbortFlow();
  console.log("manifestRepository tests passed");
})();
