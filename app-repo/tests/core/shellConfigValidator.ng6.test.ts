
import { ShellConfigValidator } from "../../src/server/ShellConfigValidator";
import * as path from "path";

// NG6 Integration Test: Verifies Slot Registry Output in ResolvedUiGraph

async function run() {
    console.log("Starting NG6 Slot Registry Test...");
    
    // 1. Setup Validator
    const repoRoot = process.cwd(); 
    const validator = new ShellConfigValidator(repoRoot);
    
    // 2. Bundle: Container(ng6-c1) -> [Button(ng6-b1), Button(ng6-b2)]
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
            "ng6-c1": {
                blockId: "ng6-c1",
                blockType: "ui.node.container",
                schemaVersion: "1.0.0",
                data: {
                    id: "ng6-c1",
                    type: "ui.node.container",
                    // NOTE: Validator requires { blockId: "..." } structure for children in v2 schema
                    children: [{ blockId: "ng6-b1" }, { blockId: "ng6-b2" }]
                }
            },
            "ng6-b1": {
                blockId: "ng6-b1",
                blockType: "ui.node.button",
                schemaVersion: "1.0.0",
                data: { id: "ng6-b1", type: "ui.node.button", label: "B1" }
            },
            "ng6-b2": {
                blockId: "ng6-b2",
                blockType: "ui.node.button",
                schemaVersion: "1.0.0",
                data: { id: "ng6-b2", type: "ui.node.button", label: "B2" }
            }
        }
    };

    // 3. Validate
    const report = await validator.validateBundle(bundle);

    // 4. Assertions
    if (report.status !== "valid") {
        console.error("NG6 FAIL: Bundle invalid", report.errors);
        process.exit(1);
    }

    const graph = report.resolvedUiGraph;
    if (!graph || !graph.slotsById) {
        console.error("NG6 FAIL: slotsById missing from resolvedUiGraph.");
        process.exit(1);
    }
    
    // Assert Container Slots
    const containerSlotId = "ng6-c1:children";
    const cSlot = graph.slotsById[containerSlotId];
    if (!cSlot) {
        console.error(`NG6 FAIL: Missing slot ${containerSlotId}`);
        process.exit(1);
    }
    
    if (cSlot.ownerNodeId !== "ng6-c1") {
        console.error(`NG6 FAIL: Slot owner incorrect. Expected ng6-c1, got ${cSlot.ownerNodeId}`);
        process.exit(1);
    }

    if (cSlot.kind !== "children") {
         console.error(`NG6 FAIL: Slot kind incorrect. Expected children, got ${cSlot.kind}`);
         process.exit(1);
    }

    if (cSlot.childIds.length !== 2 || !cSlot.childIds.includes("ng6-b1") || !cSlot.childIds.includes("ng6-b2")) {
        console.error("NG6 FAIL: Slot childIds incorrect", cSlot.childIds);
        process.exit(1);
    }
    console.log("Container slot verified.");

    // Assert Button Slot (Should exist but be empty)
    const buttonSlotId = "ng6-b1:children";
    const bSlot = graph.slotsById[buttonSlotId];
    if (!bSlot) {
         console.error(`NG6 FAIL: Missing slot ${buttonSlotId} (leaf nodes should still have default structural slots even if empty)`);
         process.exit(1);
    }
    if (bSlot.childIds.length !== 0) {
        console.error("NG6 FAIL: Button slot should be empty", bSlot.childIds);
        process.exit(1);
    }
    console.log("Button slot verified.");

    console.log("NG6 PASS");
}

run().catch(err => {
    console.error("Test Crash:", err);
    process.exit(1);
});
