import { mkdtempSync, rmSync } from "fs";
import { promises as fsp } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { getFileStorage } from "../../src/core/storage/modules/FileStorage";

async function run() {
  const base = mkdtempSync(join(tmpdir(), "fole-file-storage-"));
  const filePath = join(base, "test.txt");

  const fileStorage = getFileStorage();

  const writeResult = await fileStorage.writeTextAtomic(filePath, "hello", "utf8");
  if (!writeResult.ok) throw new Error("writeTextAtomic failed: " + writeResult.error.message);

  const readResult = await fileStorage.readText(filePath, "utf8");
  if (!readResult.ok) throw new Error("readText failed: " + readResult.error.message);
  if (readResult.value !== "hello") throw new Error("readText value mismatch");

  const delResult = await fileStorage.deleteFile(filePath);
  if (!delResult.ok) throw new Error("deleteFile failed: " + delResult.error.message);

  // Deleting again should still be ok (ENOENT treated as success)
  const delAgain = await fileStorage.deleteFile(filePath);
  if (!delAgain.ok) throw new Error("deleteFile second call failed: " + delAgain.error.message);

  rmSync(base, { recursive: true, force: true });

  console.log("fileStorage tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
