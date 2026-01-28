
import { ShellConfigValidator } from "../../src/server/ShellConfigValidator";
import { ShellBundle } from "../../src/server/ShellConfigTypes";
import * as path from "path";

// NG5 Integration Test: Verifies that validator returns a populated ResolvedUiGraph

async function run() {
    console.log("Starting NG5 ResolvedUiGraph test...");
    
    // 1. Setup Validator
    const repoRoot = process.cwd(); 
    const validator = new ShellConfigValidator(repoRoot);
    
    // 2. Bundle with Graph: Container(ng5-c1) -> [Button(ng5-b1), Button(ng5-b2)]
    const bundle: any = {
        manifest: {
            schemaVersion: "1.0.0",
            regions: {
                header: { blockId: "h" },
                footer: { blockId: "f" },
                viewport: { blockId: "v" }
            }
        },
        blocks: {
            // Minimal Shell Blocks
            "h": { blockId: "h", blockType: "shell.region.header", schemaVersion: "1.0.0", data: { title: "T" } },
            "f": { blockId: "f", blockType: "shell.region.footer", schemaVersion: "1.0.0", data: { copyrightText: "C" } },
            "v": { blockId: "v", blockType: "shell.region.viewport", schemaVersion: "1.0.0", data: { rulesId: "vr" } },
            "vr": { blockId: "vr", blockType: "shell.rules.viewport", schemaVersion: "1.0.0", data: { allowZoom: true } },
            "r": { blockId: "r", blockType: "shell.infra.routing", schemaVersion: "1.0.0", data: { routes: {}, publishedLinks: {} } },
            "t": { blockId: "t", blockType: "shell.infra.theme_tokens", schemaVersion: "1.0.0", data: { tokens: {} } },
            "w": { blockId: "w", blockType: "shell.infra.window_registry", schemaVersion: "1.0.0", data: { windows: {} } },
            "m": { blockId: "m", blockType: "shell.overlay.main_menu", schemaVersion: "1.0.0", data: { items: [] } },

            // UI Graph
            "ng5-c1": {
                blockId: "ng5-c1",
                blockType: "ui.node.container",
                schemaVersion: "1.0.0",
                data: {
                    id: "ng5-c1",
                    type: "ui.node.container",
                    // Schema requires object refs always? The container schema says "items: { type: object }"
                    // My compiler supports string, but the AJV schema I wrote requires objects.
                    children: [{ blockId: "ng5-b1" }, { blockId: "ng5-b2" }]
                }
            },
            "ng5-b1": {
                blockId: "ng5-b1",
                blockType: "ui.node.button",
                schemaVersion: "1.0.0",
                data: { id: "ng5-b1", type: "ui.node.button", label: "B1" }
            },
            "ng5-b2": {
                blockId: "ng5-b2",
                blockType: "ui.node.button",
                schemaVersion: "1.0.0",
                data: { id: "ng5-b2", type: "ui.node.button", label: "B2" }
            }
        }
    };

    // 3. Validate
    const report = await validator.validateBundle(bundle);

    // 4. Assertions
    if (report.status !== "valid") {
        console.error("NG5 FAIL: Bundle invalid", report.errors);
        process.exit(1);
    }

    const graph = report.resolvedUiGraph;
    if (!graph) {
        console.error("NG5 FAIL: report.resolvedUiGraph is undefined.");
        process.exit(1);
    }
    
    console.log("Resolved Graph Diagnostics:", graph.diagnostics);

    // Assert Node Count
    if (graph.diagnostics.nodeCount !== 3) {
        console.error(`NG5 FAIL: Expected 3 nodes, got ${graph.diagnostics.nodeCount}`);
        process.exit(1);
    }

    // Assert Edge Count
    if (graph.diagnostics.edgeCount !== 2) {
        console.error(`NG5 FAIL: Expected 2 edges, got ${graph.diagnostics.edgeCount}`);
        process.exit(1);
    }

    // Assert Roots
    if (!graph.rootNodeIds.includes("ng5-c1") || graph.rootNodeIds.length !== 1) {
        console.error("NG5 FAIL: Incorrect rootNodeIds", graph.rootNodeIds);
        process.exit(1);
    }

    // Assert Structure
    const c1 = graph.nodesById["ng5-c1"];
    if (!c1 || c1.children.length !== 2 || !c1.children.includes("ng5-b1") || !c1.children.includes("ng5-b2")) {
        console.error("NG5 FAIL: Node structure for ng5-c1 is incorrect", c1);
        process.exit(1);
    }

    console.log("NG5 PASS");
}

run().catch(err => {
    console.error("Test Crash:", err);
    process.exit(1);
});
