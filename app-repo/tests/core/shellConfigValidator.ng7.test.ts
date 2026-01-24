
import { ShellConfigDeployer } from "../../src/server/ShellConfigDeployer";
import { ShellConfigRepository } from "../../src/server/ShellConfigRepository";
import { ShellConfigValidator } from "../../src/server/ShellConfigValidator";
import * as path from "path";

// NG7 Integration Test: Verifies Stable Read Path for ResolvedUiGraph

async function run() {
    console.log("Starting NG7 ResolvedUiGraph Read Path test...");
    
    // 1. Setup
    const repoRoot = process.cwd(); 
    const repository = new ShellConfigRepository(repoRoot);
    const validator = new ShellConfigValidator(repoRoot);
    const deployer = new ShellConfigDeployer(repository, validator, repoRoot);

    // 2. Deploy Bundle with UI Graph
    // Container -> Button
    const bundle: any = {
        manifest: {
            schemaVersion: "1.0.0",
            regions: { header: { blockId: "h" }, footer: { blockId: "f" }, viewport: { blockId: "v" } }
        },
        blocks: {
            "h": { blockId: "h", blockType: "shell.region.header", schemaVersion: "1.0.0", data: { title: "T" } },
            "f": { blockId: "f", blockType: "shell.region.footer", schemaVersion: "1.0.0", data: { copyrightText: "C" } },
            "v": { blockId: "v", blockType: "shell.rules.viewport", schemaVersion: "1.0.0", data: { allowZoom: true } },
            "r": { blockId: "r", blockType: "shell.infra.routing", schemaVersion: "1.0.0", data: { routes: {}, publishedLinks: {} } },
            "t": { blockId: "t", blockType: "shell.infra.theme_tokens", schemaVersion: "1.0.0", data: { tokens: {} } },
            "w": { blockId: "w", blockType: "shell.infra.window_registry", schemaVersion: "1.0.0", data: { windows: {} } },
            "m": { blockId: "m", blockType: "shell.overlay.main_menu", schemaVersion: "1.0.0", data: { items: [] } },

            "ng7-c": {
                blockId: "ng7-c",
                blockType: "ui.node.container",
                schemaVersion: "1.0.0",
                data: {
                    id: "ng7-c",
                    type: "ui.node.container",
                    children: [{ blockId: "ng7-b" }]
                }
            },
            "ng7-b": {
                blockId: "ng7-b",
                blockType: "ui.node.button",
                schemaVersion: "1.0.0",
                data: { id: "ng7-b", type: "ui.node.button", label: "NG7 Button" }
            }
        }
    };

    console.log("Deploying NG7 bundle...");
    const deployResult = await deployer.deploy(bundle, "NG7 Test");
    const versionId = deployResult.activeVersionId;
    console.log("Deployed version:", versionId);

    // 3. Read back using new method
    console.log("Reading back ResolvedUiGraph...");
    const graph = await repository.getResolvedUiGraph(versionId);

    // 4. Assertions
    if (!graph) {
        console.error("NG7 FAIL: getResolvedUiGraph returned undefined.");
        process.exit(1);
    }

    if (graph.diagnostics.nodeCount !== 2) {
        console.error("NG7 FAIL: Node count mismatch.", graph.diagnostics);
        process.exit(1);
    }

    if (!graph.slotsById["ng7-c:children"]) {
        console.error("NG7 FAIL: Missing slot ng7-c:children");
        process.exit(1);
    }

    const slot = graph.slotsById["ng7-c:children"];
    if (!slot.childIds.includes("ng7-b")) {
        console.error("NG7 FAIL: Slot does not contain expected child id.");
        process.exit(1);
    }

    console.log("NG7 PASS");
}

run().catch(err => {
    console.error("Test Crash:", err);
    process.exit(1);
});
