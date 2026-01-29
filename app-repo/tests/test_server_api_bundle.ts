
import { ShellConfigRepository } from "../src/server/ShellConfigRepository";
import { ShellConfigValidator } from "../src/server/ShellConfigValidator";
import { ShellConfigDeployer } from "../src/server/ShellConfigDeployer";
import * as path from "path";
import { promises as fs } from "fs";

// Mock environment
const TEST_DIR = path.join(__dirname, "../tmp-server-api-test");
const REPO_DIR = path.join(TEST_DIR, "app-repo");
const CONFIG_ROOT = path.join(REPO_DIR, "config", "shell");

async function setup() {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(path.join(CONFIG_ROOT, "active"), { recursive: true });
    await fs.mkdir(path.join(CONFIG_ROOT, "archive"), { recursive: true });
    
    // Create 'defaults' dir
    await fs.mkdir(path.join(REPO_DIR, "config", "defaults", "shell"), { recursive: true });
}

async function runTest() {
    console.log("Setting up test environment...");
    await setup();

    const repo = new ShellConfigRepository(TEST_DIR);
    
    // 1. Create a HYBRID bundle on disk (Scenario mimicking user report)
    // Manifest -> viewport-placeholder
    // Disk has both blocks.
    
    const versionId = "v_hybrid_read";
    const bundlePath = path.join(CONFIG_ROOT, "archive", versionId, "bundle");
    await fs.mkdir(bundlePath, { recursive: true });

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
                 data: { contentRootId: "root-hybrid", rulesId: "garbage" }
            },
            "viewport-placeholder-rules": {
                 blockId: "viewport-placeholder-rules",
                 blockType: "shell.rules.viewport",
                 data: { rulesId: "garbage" }
            },
            // Empty canonical canonical (simulating partial state)
             "viewport": {
                 blockId: "viewport",
                 blockType: "shell.region.viewport",
                 data: {} 
            }
        }
    };

    // Write files
    await fs.writeFile(path.join(bundlePath, "shell.manifest.json"), JSON.stringify(bundleInput.manifest));
    const meta = { versionId, timestamp: new Date().toISOString() };
    await fs.writeFile(path.join(path.dirname(bundlePath), "meta.json"), JSON.stringify(meta));
    await fs.writeFile(path.join(path.dirname(bundlePath), "validation.json"), JSON.stringify({status:"valid",errors:[]}));

    for (const [id, block] of Object.entries(bundleInput.blocks)) {
        await fs.writeFile(path.join(bundlePath, `${id}.json`), JSON.stringify(block));
    }

    console.log("Calling repo.getBundle()...");
    const result = await repo.getBundle(versionId);

    console.log("Verifying In-Memory Normalization on Return...");

    // 1. Manifest
    if (result.bundle.manifest.regions.viewport.blockId !== "viewport") {
        throw new Error(`FAIL: Manifest was not normalized! Got: ${result.bundle.manifest.regions.viewport.blockId}`);
    } else {
        console.log("PASS: Manifest normalized to 'viewport'");
    }

    // 2. Blocks
    const blocks = result.bundle.blocks;
    if (blocks["viewport-placeholder"]) throw new Error("FAIL: viewport-placeholder block leaked!");
    if (!blocks["viewport"]) throw new Error("FAIL: viewport block missing!");
    
    if (blocks["viewport"].data.contentRootId !== "root-hybrid") {
        throw new Error(`FAIL: contentRootId lost! Got: ${blocks["viewport"].data.contentRootId}`);
    } else {
        console.log("PASS: contentRootId preserved");
    }

    console.log("ALL TESTS PASSED");
}

runTest().catch(err => {
    console.error(err);
    process.exit(1);
});
