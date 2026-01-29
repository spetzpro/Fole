
import { ShellConfigRepository } from "../src/server/ShellConfigRepository";
import { ShellConfigValidator } from "../src/server/ShellConfigValidator";
import { ShellConfigDeployer } from "../src/server/ShellConfigDeployer";
import * as path from "path";
import { promises as fs } from "fs";

// Mock environment
const TEST_DIR = path.join(__dirname, "../tmp-viewport-normalization-test");
const REPO_DIR = path.join(TEST_DIR, "app-repo");
const CONFIG_ROOT = path.join(REPO_DIR, "config", "shell");

async function setup() {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(path.join(CONFIG_ROOT, "active"), { recursive: true });
    await fs.mkdir(path.join(CONFIG_ROOT, "archive"), { recursive: true });
    
    // Create 'defaults' dir needed by repo init to prevent crash
    await fs.mkdir(path.join(REPO_DIR, "config", "defaults", "shell"), { recursive: true });
}

async function runTest() {
    console.log("Setting up test environment...");
    await setup();

    const repo = new ShellConfigRepository(TEST_DIR);
    const validator = new ShellConfigValidator(TEST_DIR);
    const deployer = new ShellConfigDeployer(repo, validator, TEST_DIR);

    // 1. Create a bundle with viewport-placeholder AND contentRootId
    const bundleInput = {
        manifest: {
            schemaVersion: "1.0.0",
            regions: {
                viewport: { blockId: "viewport-placeholder" }
            }
        },
        blocks: {
            "viewport-placeholder": {
                blockId: "viewport-placeholder",
                blockType: "shell.region.viewport",
                schemaVersion: "1.0.0",
                data: {
                    contentRootId: "root-container",
                    rulesId: "viewport-placeholder-rules"
                }
            },
            "viewport-placeholder-rules": {
                blockId: "viewport-placeholder-rules",
                blockType: "shell.rules.viewport",
                schemaVersion: "1.0.0",
                data: { rulesId: "viewport-placeholder-rules" }
            },
            "root-container": {
                 blockId: "root-container",
                 blockType: "ui.node.container",
                 data: { children: [] }
            }
        }
    };

    console.log("Deploying bundle with viewport-placeholder...");
    
    // We mock validation pass or ensure minimal validity.
    // However, deployer's Validator will try to load schemas from disk which don't exist in tmp.
    // Instead of full deploy, let's test normalizeViewportRegion directly on a crafted folder,
    // reflecting how deployer uses it.
    
    const versionId = "v_test_normalization";
    const bundlePath = path.join(CONFIG_ROOT, "archive", versionId, "bundle");
    await fs.mkdir(bundlePath, { recursive: true });
    
    // Write files
    await fs.writeFile(path.join(bundlePath, "shell.manifest.json"), JSON.stringify(bundleInput.manifest));
    for (const [id, block] of Object.entries(bundleInput.blocks)) {
        await fs.writeFile(path.join(bundlePath, `${id}.json`), JSON.stringify(block));
    }

    console.log("Running normalizeViewportRegion...");
    await repo.normalizeViewportRegion(bundlePath);

    console.log("Verifying results...");
    
    // Check Manifest
    const manifest = JSON.parse(await fs.readFile(path.join(bundlePath, "shell.manifest.json"), "utf-8"));
    if (manifest.regions.viewport.blockId !== "viewport") {
        throw new Error(`FAIL: Manifest points to ${manifest.regions.viewport.blockId}, expected 'viewport'`);
    } else {
        console.log("PASS: Manifest points to 'viewport'");
    }

    // Check Host File
    try {
        await fs.access(path.join(bundlePath, "viewport.json"));
        console.log("PASS: viewport.json exists");
    } catch {
        throw new Error("FAIL: viewport.json missing");
    }

    try {
        await fs.access(path.join(bundlePath, "viewport-placeholder.json"));
        throw new Error("FAIL: viewport-placeholder.json still exists!");
    } catch {
        console.log("PASS: viewport-placeholder.json removed");
    }

    // Check Host Content (Preserved contentRootId?)
    const host = JSON.parse(await fs.readFile(path.join(bundlePath, "viewport.json"), "utf-8"));
    if (host.data.contentRootId !== "root-container") {
        throw new Error(`FAIL: contentRootId lost! Found: ${host.data.contentRootId}`);
    } else {
        console.log("PASS: contentRootId preserved as 'root-container'");
    }
    
    if (host.data.rulesId !== "viewport-rules") {
        throw new Error(`FAIL: rulesId not updated! Found: ${host.data.rulesId}`);
    } else {
        console.log("PASS: rulesId updated to 'viewport-rules'");
    }

    // Check Rules File
    try {
        await fs.access(path.join(bundlePath, "viewport-rules.json"));
         console.log("PASS: viewport-rules.json exists");
    } catch {
        throw new Error("FAIL: viewport-rules.json missing");
    }

    console.log("\n--- TEST SCENARIO 2: Manifest Correct, Content Wrong ---");

    // SETUP: Manifest says 'viewport', but file contains 'viewport-placeholder'
    const bundleInput2 = JSON.parse(JSON.stringify(bundleInput));
    bundleInput2.manifest.regions.viewport.blockId = "viewport";
    // Block content still has "viewport-placeholder" as blockId
    
    // We must write this as viewport.json because manifest points to 'viewport'
    const version2 = "v_test_normalization_2";
    const bundlePath2 = path.join(CONFIG_ROOT, "archive", version2, "bundle");
    await fs.mkdir(bundlePath2, { recursive: true });

    await fs.writeFile(path.join(bundlePath2, "shell.manifest.json"), JSON.stringify(bundleInput2.manifest));
    
    // Write the "Host" file as viewport.json (as manifest expects) BUT with content of placeholder
    await fs.writeFile(path.join(bundlePath2, "viewport.json"), JSON.stringify(bundleInput.blocks["viewport-placeholder"]));
    
    // Write rules
    await fs.writeFile(path.join(bundlePath2, "viewport-placeholder-rules.json"), JSON.stringify(bundleInput.blocks["viewport-placeholder-rules"]));

    console.log("Running normalizeViewportRegion (Scenerio 2)...");
    await repo.normalizeViewportRegion(bundlePath2);

    console.log("Verifying results (Scenario 2)...");
    const host2 = JSON.parse(await fs.readFile(path.join(bundlePath2, "viewport.json"), "utf-8"));
    
    if (host2.blockId !== "viewport") {
        throw new Error(`FAIL: Block ID not corrected! Found: ${host2.blockId}`);
    } else {
        console.log("PASS: Block ID corrected to 'viewport'");
    }
    
    if (host2.data.rulesId !== "viewport-rules") {
        throw new Error(`FAIL: rulesId not corrected! Found: ${host2.data.rulesId}`);
    } else {
        console.log("PASS: rulesId corrected to 'viewport-rules'");
    }

    try {
        await fs.access(path.join(bundlePath2, "viewport.json"));
        console.log("PASS: viewport.json exists (not deleted)");
    } catch {
        throw new Error("FAIL: viewport.json was deleted!");
    }

    // Check Rules renaming
     try {
        await fs.access(path.join(bundlePath2, "viewport-rules.json"));
         console.log("PASS: viewport-rules.json created");
    } catch {
        throw new Error("FAIL: viewport-rules.json missing");
    }



    console.log("\n--- TEST SCENARIO 3: Hybrid Mess (Both Exist + Dirty Rules) ---");

    // SETUP: Manifest points to placeholder.
    // BOTH placeholder and canonical files exist.
    // Canonical Host: missing contentRootId
    // Placeholder Host: has contentRootId (should be rescued)
    // Canonical Rules: has bad key 'contentRootId' (should be cleaned)
    
    const version3 = "v_test_normalization_3";
    const bundlePath3 = path.join(CONFIG_ROOT, "archive", version3, "bundle");
    await fs.mkdir(bundlePath3, { recursive: true });

    // Manifest -> viewport-placeholder
    const manifest3 = JSON.parse(JSON.stringify(bundleInput.manifest));
    manifest3.regions.viewport.blockId = "viewport-placeholder";
    await fs.writeFile(path.join(bundlePath3, "shell.manifest.json"), JSON.stringify(manifest3));

    // Placeholder Host (Has contentRootId="root-container")
    await fs.writeFile(path.join(bundlePath3, "viewport-placeholder.json"), JSON.stringify(bundleInput.blocks["viewport-placeholder"]));
    
    // Canonical Host (Empty data, missing contentRootId)
    const badCanonicalHost = {
        blockId: "viewport",
        blockType: "shell.region.viewport",
        data: { rulesId: "viewport-rules" } // Missng contentRootId
    };
    await fs.writeFile(path.join(bundlePath3, "viewport.json"), JSON.stringify(badCanonicalHost));

    // Canonical Rules (Dirty)
    const dirtyRules = {
        blockId: "viewport-rules",
        blockType: "shell.rules.viewport",
        data: {
            allowZoom: true,
            contentRootId: "SHOULD_BE_REMOVED",
            rulesId: "viewport-rules"
        }
    };
    await fs.writeFile(path.join(bundlePath3, "viewport-rules.json"), JSON.stringify(dirtyRules));
    
    // Placeholder Rules (Should be ignored/deleted)
    await fs.writeFile(path.join(bundlePath3, "viewport-placeholder-rules.json"), JSON.stringify(bundleInput.blocks["viewport-placeholder-rules"]));

    console.log("Running normalizeViewportRegion (Scenario 3)...");
    await repo.normalizeViewportRegion(bundlePath3);

    console.log("Verifying results (Scenario 3)...");

    // 1. Manifest
    const m3 = JSON.parse(await fs.readFile(path.join(bundlePath3, "shell.manifest.json"), "utf-8"));
    if (m3.regions.viewport.blockId !== "viewport") throw new Error("Manifest not updated to 'viewport'");
    console.log("PASS: Manifest updated");

    // 2. Host (Merged Data)
    const h3 = JSON.parse(await fs.readFile(path.join(bundlePath3, "viewport.json"), "utf-8"));
    if (h3.data.contentRootId !== "root-container") throw new Error("Failed to rescue contentRootId from placeholder!");
    console.log("PASS: contentRootId rescued from placeholder");
    if (h3.data.rulesId !== "viewport-rules") throw new Error("rulesId incorrect");

    // 3. Rules (Cleaned)
    const r3 = JSON.parse(await fs.readFile(path.join(bundlePath3, "viewport-rules.json"), "utf-8"));
    if (r3.data.contentRootId) throw new Error("Rules data still has contentRootId!");
    if (r3.data.rulesId) throw new Error("Rules data still has rulesId!");
    if (r3.data.allowZoom !== true) throw new Error("Rules data lost valid keys!");
    console.log("PASS: Rules data cleaned");

    // 4. Pruning
    try { await fs.access(path.join(bundlePath3, "viewport-placeholder.json")); throw new Error("Placeholder Host not deleted"); } catch {}
    try { await fs.access(path.join(bundlePath3, "viewport-placeholder-rules.json")); throw new Error("Placeholder Rules not deleted"); } catch {}
    console.log("PASS: Placeholders pruned");

    console.log("\n--- TEST SCENARIO 4: In-Memory Normalization (Read Path) ---");
    // Verify that the static method works correctly on object structure without touching disk.
    
    const hybridBundle = {
        manifest: {
            schemaVersion: "1.0.0",
            regions: {
                viewport: { blockId: "viewport-placeholder" }
            }
        },
        blocks: {
            "viewport-placeholder": {
                 blockId: "viewport-placeholder",
                 blockType: "shell.region.viewport",
                 data: { contentRootId: "memory-root", rulesId: "garbage" }
            },
             "viewport-placeholder-rules": {
                 blockId: "viewport-placeholder-rules",
                 blockType: "shell.rules.viewport",
                 data: { rulesId: "garbage", allowZoom: false } 
            }
            // No canonical blocks
        }
    };
    
    // @ts-ignore
    const result = ShellConfigRepository.normalizeBundleInMemory(hybridBundle);
    
    if (result.manifest.regions.viewport.blockId !== "viewport") throw new Error("Memory: Manifest not updated");
    if (result.blocks["viewport-placeholder"]) throw new Error("Memory: Placeholder host not removed");
    if (result.blocks["viewport-placeholder-rules"]) throw new Error("Memory: Placeholder rules not removed");
    if (!result.blocks["viewport"]) throw new Error("Memory: Canonical host not created");
    
    const h = result.blocks["viewport"];
    if (h.data.contentRootId !== "memory-root") throw new Error("Memory: contentRootId lost");
    if (h.data.rulesId !== "viewport-rules") throw new Error("Memory: rulesId incorrect");
    
    const r = result.blocks["viewport-rules"];
    if (r.data.rulesId) throw new Error("Memory: rulesId not cleaned from rules data");
    if (r.data.allowZoom !== false) throw new Error("Memory: rules data lost");
    
    console.log("PASS: In-Memory normalization correct");

    console.log("ALL TESTS PASSED");
}

runTest().catch(err => {
    console.error(err);
    process.exit(1);
});
