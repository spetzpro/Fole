
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ShellConfigRepository } from '../src/server/ShellConfigRepository';
import { ActivePointer } from '../src/server/ShellConfigTypes';

// Helper to create temp workspace
async function setupTempRepo() {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fole-test-"));
    const configRoot = path.join(tmpDir, "app-repo", "config", "shell");
    await fs.promises.mkdir(path.join(configRoot, "archive"), { recursive: true });
    
    // Create ConfigRepo
    const repo = new ShellConfigRepository(tmpDir); // Repo takes workspace root
    // But repo assumes default path structure.
    
    return { tmpDir, configRoot, repo };
}

async function createMockBundle(configRoot: string, versionId: string, valid: boolean = true) {
    const vPath = path.join(configRoot, "archive", versionId);
    await fs.promises.mkdir(path.join(vPath, "bundle"), { recursive: true });
    
    if (valid) {
        await fs.promises.writeFile(path.join(vPath, "meta.json"), JSON.stringify({ versionId, timestamp: new Date().toISOString() }));
        await fs.promises.writeFile(path.join(vPath, "validation.json"), JSON.stringify({ status: "valid", errors: [] }));
        await fs.promises.writeFile(path.join(vPath, "bundle", "shell.manifest.json"), JSON.stringify({ schemaVersion: "1.0.0", regions: { viewport: {} } }));
        await fs.promises.writeFile(path.join(vPath, "bundle", "global.json"), JSON.stringify({ blockId: "global", blockType: "container", data: {} }));
    }
    // If not valid, we just leave the dir (corrupt/empty)
}

async function run() {
    console.log("Running Startup Healing & Fallback Unit Tests...");

    // Test 1: Startup Healing (getActivePointer heals missing active version)
    {
        console.log("\n[Test 1] Startup Healing");
        const { tmpDir, configRoot, repo } = await setupTempRepo();
        
        // Setup: Active points to vMissing. Archive has v1.
        await fs.promises.writeFile(path.join(configRoot, "active.json"), JSON.stringify({
            activeVersionId: "vMissing",
            lastUpdated: new Date().toISOString()
        } as ActivePointer));
        
        await createMockBundle(configRoot, "v1");

        // Act: Simulate startup calling getActivePointer()
        const active = await repo.getActivePointer();

        // Assert
        if (!active) throw new Error("getActivePointer returned null");
        if (active.activeVersionId !== "v1") throw new Error(`Expected v1, got ${active.activeVersionId}`);
        console.log("PASS: Healed to v1");
        
        // Clean
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
    }

    // Test 2: Helper getLatestAvailableVersionId (Filters invalid & test junk)
    {
        console.log("\n[Test 2] getLatestAvailableVersionId");
         const { tmpDir, configRoot, repo } = await setupTempRepo();
        
         // Scenario:
         // v100: Valid
         // v200: Valid
         // v_test_999: Valid (but likely junk)
         // v300: Invalid (no manifest)
         
         await createMockBundle(configRoot, "v100");
         await createMockBundle(configRoot, "v200");
         await createMockBundle(configRoot, "v_test_999");
         
         // Create broken v300 (folder exists, no manifest)
         const v300 = path.join(configRoot, "archive", "v300");
         await fs.promises.mkdir(path.join(v300, "bundle"), { recursive: true });

         const latest = await repo.getLatestAvailableVersionId();
         // Should return v200. 
         // v300 skipped (no manifest).
         // v_test_999 skipped (contains "test" and others exist).
         
         if (latest !== "v200") throw new Error(`Expected v200, got ${latest}`);
         console.log("PASS: Found v200 (Skipped broken v300 and test version)");
         
         await fs.promises.rm(tmpDir, { recursive: true, force: true });
    }
    
    // Test 3: getBundle tolerates missing validation.json
    {
         console.log("\n[Test 3] getBundle tolerates missing validation.json");
         const { tmpDir, configRoot, repo } = await setupTempRepo();
         
         // Create v1 without validation.json
         const vPath = path.join(configRoot, "archive", "v1");
         await fs.promises.mkdir(path.join(vPath, "bundle"), { recursive: true });
         await fs.promises.writeFile(path.join(vPath, "meta.json"), JSON.stringify({ versionId: "v1" }));
         await fs.promises.writeFile(path.join(vPath, "bundle", "shell.manifest.json"), JSON.stringify({ schemaVersion: "1.0.0", regions: { viewport: {} } }));
         await fs.promises.writeFile(path.join(vPath, "bundle", "global.json"), JSON.stringify({ blockId: "global", blockType: "container", data: {} }));
         
         // Do NOT create validation.json
         
         const bundle = await repo.getBundle("v1");
         if (!bundle || bundle.versionId !== "v1") throw new Error("Failed to load bundle");
         if (bundle.validation.status !== "warn") throw new Error(`Expected warn status, got ${bundle.validation.status}`);
         
         console.log("PASS: Loaded bundle without validation.json");
         
         await fs.promises.rm(tmpDir, { recursive: true, force: true });
    }

    console.log("\nAll Unit Tests Passed.");
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});
