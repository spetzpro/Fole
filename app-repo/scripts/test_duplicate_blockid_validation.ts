
import { ShellConfigRepository } from "../src/server/ShellConfigRepository";
import { promises as fs } from "fs";
import * as path from "path";
import os from "os";

// We need to sub-class or shim ShellConfigRepository to point to a temp dir
class TestConfigRepo extends ShellConfigRepository {
    constructor(tempDir: string) {
        super(tempDir);
    }
}

async function run() {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fole-test-dupe-"));
    console.log(`Temp dir: ${tmpDir}`);
    
    // Setup structure: app-repo/config/shell/archive/vTemp/bundle
    const archivePath = path.join(tmpDir, "app-repo", "config", "shell", "archive", "vTemp");
    const bundlePath = path.join(archivePath, "bundle");
    
    await fs.mkdir(bundlePath, { recursive: true });

    // Write minimal meta/etc so it loads
    await fs.writeFile(path.join(archivePath, "meta.json"), "{}");
    await fs.writeFile(path.join(archivePath, "validation.json"), "{}");
    await fs.writeFile(path.join(bundlePath, "shell.manifest.json"), '{"regions":{},"schemaVersion":"1.0.0"}');

    // WRITE DUPLICATE BLOCKS
    // File 1: defines block "foo" explicitly
    await fs.writeFile(path.join(bundlePath, "file1.json"), JSON.stringify({
        blockId: "foo",
        blockType: "test",
        schemaVersion: "1.0.0",
        data: {}
    }));
    
    // File 2: defines block "foo" explicitly
    await fs.writeFile(path.join(bundlePath, "file2.json"), JSON.stringify({
        blockId: "foo",
        blockType: "test",
        schemaVersion: "1.0.0",
        data: {}
    }));

    const repo = new TestConfigRepo(tmpDir);

    console.log("Attempting to load bundle with duplicates...");
    try {
        await repo.getBundle("vTemp");
        console.error("❌ FAIL: Expected validation error but got success.");
        process.exit(1);
    } catch (e: any) {
        if (e.message.includes("Duplicate blockId")) {
            console.log("✅ PASS: Caught expected duplicate error:", e.message);
            process.exit(0);
        } else {
             console.error("❌ FAIL: Caught unexpected error:", e);
             process.exit(1);
        }
    }
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});
