
import { ShellConfigRepository } from "../src/server/ShellConfigRepository";
import { ShellConfigValidator } from "../src/server/ShellConfigValidator";
import * as path from "path";
import * as fs from "fs";

async function run() {
    console.log("Starting Regression Test for Viewport Host Preservation (Direct Repository Access)...");

    const rootDir = path.resolve(__dirname, "..", "..");
    const repo = new ShellConfigRepository(rootDir);
    const validator = new ShellConfigValidator(rootDir);

    await repo.ensureInitialized();

    // 1. Get Active Version
    const activePointer = await repo.getActivePointer();
    if (!activePointer) {
        console.error("No active configuration found.");
        process.exit(1);
    }
    const baseVersionId = activePointer.activeVersionId;
    console.log(`Base Version: ${baseVersionId}`);

    // 2. Clone & Patch Simulation (Save Draft)
    const dummyBlock: any = {
        blockId: "regression-test-dummy",
        blockType: "sysadmin.dummy",
        schemaVersion: "1.0.0",
        data: { timestamp: Date.now() }
    };

    console.log("Creating new version via Repository...");
    // Simulate what the API does: cloneVersionWithPatchedSysadmin
    // The API calls repository.cloneVersionWithPatchedSysadmin
    
    // We purposefully verify that the clone operation preserves the viewport host
    const result = await repo.cloneVersionWithPatchedSysadmin(baseVersionId, "Regression Test Draft (Direct)", {
        "regression-test-dummy": dummyBlock
    });

    const newVersionId = result.newVersionId;
    console.log(`New Version Created: ${newVersionId}`);

    // 3. Activate (using Repository)
    console.log("Activating new version...");
    await repo.activateVersion(newVersionId, "Regression Test Activation (Direct)", "developer");

    // 4. Verify Bundle Content
    const bundle = await repo.getBundle(newVersionId);
    
    // Verify viewport block
    const viewport = bundle.bundle.blocks["viewport"];
    const viewportPlaceholder = bundle.bundle.blocks["viewport-placeholder"];

    let failed = false;

    if (viewportPlaceholder) {
        console.error("FAIL: viewport-placeholder block found in new bundle!");
        failed = true;
    }

    if (!viewport) {
        console.error("FAIL: viewport block MISSING in new bundle!");
        failed = true;
    } else {
        if (viewport.blockType !== "shell.region.viewport") {
             console.error(`FAIL: viewport.blockType is ${viewport.blockType}, expected shell.region.viewport`);
             failed = true;
        }
        if (!viewport.data.contentRootId) {
             console.error("FAIL: viewport.data.contentRootId is missing!");
             failed = true;
        }
    }
    
    // Check manifest
    if (bundle.bundle.manifest.regions.viewport?.blockId !== "viewport") {
         console.error(`FAIL: Manifest viewport region points to ${bundle.bundle.manifest.regions.viewport?.blockId}, expected 'viewport'`);
         failed = true;
    }

    if (!failed) {
        console.log("SUCCESS: Regression test passed. Viewport host preserved.");
        
        // Revert to base
        console.log("Reverting active pointer...");
        await repo.activateVersion(baseVersionId, "Regression Test Cleanup");
    } else {
        process.exit(1);
    }
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});
