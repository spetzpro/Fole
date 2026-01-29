/**
 * TEST: Active Pointer Healing
 * 
 * Verifies that getActivePointer() automatically heals the system configuration
 * if active.json points to a version folder that does not exist.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ShellConfigRepository } from '../src/server/ShellConfigRepository';

async function runTest() {
    console.log("=== STARTING TEST: Active Pointer Healing ===");

    // 1. Setup Temp Repo
    const tempRoot = path.join(os.tmpdir(), 'fole_healing_test_' + Date.now());
    const configPath = path.join(tempRoot, 'app-repo', 'config', 'shell');
    const archivePath = path.join(configPath, 'archive');

    await fs.promises.mkdir(archivePath, { recursive: true });

    // 2. Create Valid Archives
    // v1 (Old)
    await fs.promises.mkdir(path.join(archivePath, 'v1000'));
    // v2 (Newest)
    await fs.promises.mkdir(path.join(archivePath, 'v2000'));

    // 3. Corrupt Active Pointer
    // Point to 'vMissing' which doesn't exist
    const corruptPointer = {
        activeVersionId: "vMissing",
        lastUpdated: new Date().toISOString(),
        safeMode: false
    };
    await fs.promises.writeFile(
        path.join(configPath, 'active.json'), 
        JSON.stringify(corruptPointer)
    );

    // 4. Run Healing via Repository
    const repo = new ShellConfigRepository(tempRoot);
    
    console.log("Requesting active pointer (expecting healing)...");
    const healedPointer = await repo.getActivePointer();
    
    // 5. Assertions
    if (!healedPointer) {
        throw new Error("FAIL: Returned null pointer instead of healing.");
    }

    console.log(`Resolved Version: ${healedPointer.activeVersionId}`);

    if (healedPointer.activeVersionId !== "v2000") {
        throw new Error(`FAIL: Did not choose newest version. Got ${healedPointer.activeVersionId}, expected v2000.`);
    }

    // Verify Persistence (Active file on disk must be updated)
    const diskContent = JSON.parse(await fs.promises.readFile(path.join(configPath, 'active.json'), 'utf-8'));
    if (diskContent.activeVersionId !== "v2000") {
        throw new Error("FAIL: Did not persist healed pointer to disk.");
    }
    
    if (!diskContent.activationReason || !diskContent.activationReason.includes("Self-Healed")) {
        throw new Error("FAIL: Did not set activation reason.");
    }

    console.log("PASS: Pointer healed and persisted.");
    console.log("=== ALL TESTS PASSED ===");

    // Cleanup
    try { await fs.promises.rm(tempRoot, { recursive: true, force: true }); } catch {}
}

runTest().catch(e => {
    console.error(e);
    process.exit(1);
});
