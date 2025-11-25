import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createStoragePaths } from "../../src/core/storage/StoragePaths";
import { createProjectPathResolver } from "../../src/core/storage/modules/ProjectPathResolver";
import { createProjectRegistry } from "../../src/core/storage/modules/ProjectRegistry";

async function run() {
  const base = mkdtempSync(join(tmpdir(), "fole-project-registry-"));
  const storageRoot = join(base, "storage");

  const storagePaths = createStoragePaths({ storageRoot });
  const resolver = createProjectPathResolver(storagePaths);
  const registry = createProjectRegistry(resolver);

  const created = await registry.createProject("My Project");
  if (!created.ok) throw new Error("createProject failed: " + created.error.message);

  const listed = await registry.listProjects();
  if (!listed.ok) throw new Error("listProjects failed: " + listed.error.message);
  if (listed.value.length !== 1) throw new Error("expected 1 project, got " + listed.value.length);

  const opened = await registry.openProject(created.value.id);
  if (!opened.ok) throw new Error("openProject failed: " + opened.error.message);

  // Clean up temp directory
  rmSync(base, { recursive: true, force: true });

  console.log("projectRegistry tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
