
import * as path from "path";
import { ShellConfigValidator } from "../src/server/ShellConfigValidator";
import { ShellBundle } from "../src/server/ShellConfigTypes";

async function runTest() {
    console.log("Running Hermetic Resolved Graph Unit Test...");

    const repoRoot = process.cwd(); // Assumes running from workspace root
    const validator = new ShellConfigValidator(repoRoot);

    // Mock Bundle with 1 UI Node
    const bundle: ShellBundle["bundle"] = {
        manifest: {
            schemaVersion: "1.0.0",
            regions: {
                header: { blockId: "block-header" },
                viewport: { blockId: "block-viewport" }, 
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
            "block-viewport": {
                blockId: "block-viewport",
                blockType: "shell.region.viewport",
                schemaVersion: "1.0.0",
                data: {}
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

    console.log("Validating bundle...");
    try {
        const report = await validator.validateBundle(bundle);
        
        console.log("Validation Status:", report.status);
        console.log("Resolved Graph Present:", !!report.resolvedUiGraph);

        if (report.resolvedUiGraph) {
            const nodes = Object.keys(report.resolvedUiGraph.nodesById);
            console.log("Graph Nodes:", nodes);
            
            if (nodes.includes("ui-node-1")) {
                console.log("SUCCESS: ui-node-1 found in resolved graph.");
                process.exit(0);
            } else {
                console.error("FAILURE: ui-node-1 missing from graph.");
                process.exit(1);
            }
        } else {
            // It might fail validation due to missing schemas or types, but we want to see if graph is produced regardless?
            // Wait, validateBundle only produces graph if Status is valid? 
            // NO, `compileUiGraph` is called and `resolvedUiGraph` is returned even if errors exist (as per NG5 fix).
            
            console.error("FAILURE: No resolved graph returned.");
            console.log("Errors:", JSON.stringify(report.errors, null, 2));
            process.exit(1);
        }

    } catch (err) {
        console.error("Test Exception:", err);
        process.exit(1);
    }
}

runTest();
