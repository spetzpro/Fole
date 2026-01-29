
import { ShellConfigValidator } from "../src/server/ShellConfigValidator";
import { ShellConfigRepository } from "../src/server/ShellConfigRepository";
import { ShellBundle } from "../src/server/ShellConfigTypes";

async function runTest() {
    console.log("Running Hermetic Resolved Graph Normalization Test...");

    const repoRoot = process.cwd(); // Assumes running from workspace root
    const validator = new ShellConfigValidator(repoRoot);

    // Mock Bundle with Viewport Mismatch (Legacy/Hybrid State)
    const bundle: ShellBundle["bundle"] = {
        manifest: {
            schemaVersion: "1.0.0",
            regions: {
                header: { blockId: "block-header" },
                // POINTS TO RULES BLOCK (Mismatch), should be normalized to region host
                viewport: { blockId: "viewport" }, 
                footer: { blockId: "block-footer" }
            }
        },
        blocks: {
            "block-header": {
                blockId: "block-header",
                blockType: "shell.region.header",
                schemaVersion: "1.0.0",
                data: {}
            },
            // The "viewport" block here is a rules block, NOT a region block
            "viewport": {
                blockId: "viewport",
                blockType: "shell.rules.viewport",
                schemaVersion: "1.0.0",
                data: {
                    contentRootId: "ui-node-1"
                }
            },
            "block-footer": {
                blockId: "block-footer",
                blockType: "shell.region.footer",
                schemaVersion: "1.0.0",
                data: {}
            },
            "ui-node-1": {
                blockId: "ui-node-1",
                blockType: "ui.node.container",
                schemaVersion: "1.0.0",
                data: {
                    children: []
                }
            }
        }
    };

    console.log("1. Validating RAW bundle (Expect Failure/Warning or No Graph)...");
    const rawReport = await validator.validateBundle(bundle);
    
    // Check if raw report fails graph generation due to missing viewport host
    // (The validator expects the viewport region to point to a shell.region.viewport block)
    // Actually, strict validator might just error on "region_role_mismatch" and maybe still produce graph?
    // But let's see. 
    // In current code: compiledUiGraph does NOT depend on manifest regions, it just scans ui.node.*
    // However, if the manifest regions are wrong, the overall status is invalid.
    
    console.log("Raw Status:", rawReport.status);
    // console.log("Raw Errors:", JSON.stringify(rawReport.errors, null, 2));

    console.log("2. Healing Bundle In-Memory...");
    const healedBundle = ShellConfigRepository.healBundleInMemory(bundle);

    // Check if healing happened
    const viewportId = healedBundle.manifest.regions.viewport?.blockId;
    const viewportBlock = healedBundle.blocks[viewportId || ""];
    
    console.log("Healed Viewport ID:", viewportId);
    console.log("Healed Viewport Type:", viewportBlock?.blockType);
    
    if (viewportBlock?.blockType === "shell.region.viewport") {
        console.log("SUCCESS: Viewport Type normalized to shell.region.viewport.");
    } else {
        console.error(`FAILURE: Viewport Type is ${viewportBlock?.blockType} (expected shell.region.viewport).`);
        // We persist to see graph result anyway
    }

    console.log("3. Validating Healed Bundle...");
    const healedReport = await validator.validateBundle(healedBundle);

    console.log("Healed Status:", healedReport.status);
    console.log("Resolved Graph Present:", !!healedReport.resolvedUiGraph);

    if (healedReport.resolvedUiGraph) {
         const nodes = Object.keys(healedReport.resolvedUiGraph.nodesById);
         if (nodes.includes("ui-node-1")) {
             console.log("SUCCESS: ui-node-1 found in healed graph.");
             process.exit(0);
         } else {
             console.error("FAILURE: ui-node-1 missing from healed graph.");
             process.exit(1);
         }
    } else {
        console.error("FAILURE: No resolved graph returned after healing.");
        console.log("Errors:", JSON.stringify(healedReport.errors, null, 2));
        process.exit(1);
    }
}

runTest();
