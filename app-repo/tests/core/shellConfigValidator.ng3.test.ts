
import { ShellConfigValidator } from "../../src/server/ShellConfigValidator";
import * as path from "path";

// NG3 Integration Test: Verifies UI Graph Compilation (Integrity & Cycle Detection)

async function run() {
    console.log("Starting NG3 V2 Graph Compilation test...");
    
    // 1. Setup Validator
    const repoRoot = process.cwd(); 
    const validator = new ShellConfigValidator(repoRoot);
    
    // 2. Base Valid Bundle
    const baseBundle: any = {
        manifest: {
            schemaVersion: "1.0.0",
            regions: {
                header: { blockId: "blk_header" },
                footer: { blockId: "blk_footer" },
                viewport: { blockId: "blk_viewport" }
            }
        },
        blocks: {
            // Mandated
            "blk_header": { blockId: "blk_header", blockType: "shell.region.header", schemaVersion: "1.0.0", data: { title: "App" } },
            "blk_footer": { blockId: "blk_footer", blockType: "shell.region.footer", schemaVersion: "1.0.0", data: { copyrightText: "©" } },
            "blk_viewport": { blockId: "blk_viewport", blockType: "shell.rules.viewport", schemaVersion: "1.0.0", data: { allowZoom: true } },
            "blk_routing": { blockId: "blk_routing", blockType: "shell.infra.routing", schemaVersion: "1.0.0", data: { routes: {}, publishedLinks: {} } },
            "blk_theme": { blockId: "blk_theme", blockType: "shell.infra.theme_tokens", schemaVersion: "1.0.0", data: { tokens: {} } },
            "blk_windows": { blockId: "blk_windows", blockType: "shell.infra.window_registry", schemaVersion: "1.0.0", data: { windows: {} } },
            "blk_main_menu": { blockId: "blk_main_menu", blockType: "shell.overlay.main_menu", schemaVersion: "1.0.0", data: { items: [] } },
            
            // Valid Graph
            // Container -> [Button]
            "cont-1": {
                blockId: "cont-1",
                blockType: "ui.node.container",
                schemaVersion: "1.0.0",
                data: {
                    id: "cont-1",
                    type: "ui.node.container",
                    direction: "column",
                    // Schema requires object refs
                    children: [{ blockId: "btn-1" }] 
                }
            },
            "btn-1": {
                blockId: "btn-1",
                blockType: "ui.node.button",
                schemaVersion: "1.0.0",
                data: {
                    id: "btn-1",
                    type: "ui.node.button",
                    label: "My Button"
                }
            }
        }
    };

    // 3. Positive Test
    console.log("Running positive validation (Valid Graph)...");
    const report = await validator.validateBundle(baseBundle);
    if (report.status !== "valid") {
        console.error("NG3 Positive Test Failed:", JSON.stringify(report.errors, null, 2));
        process.exit(1);
    }
    console.log("Positive pass.");

    // 4. Negative Test 1: Missing Child
    console.log("Running negative validation (Missing Child)...");
    const missingChildBundle = JSON.parse(JSON.stringify(baseBundle));
    // Add reference to non-existent child
    missingChildBundle.blocks["cont-1"].data.children.push({ blockId: "ghost-node" });
    
    const missingReport = await validator.validateBundle(missingChildBundle);
    if (missingReport.status === "valid") {
        console.error("NG3 Failed: Expected error for missing child");
        process.exit(1);
    }
    const missingError = missingReport.errors.find((e: any) => e.code === "ui_graph_compile_failed" && e.message.includes("missing child"));
    if (!missingError) {
        console.error("NG3 Failed: Did not find ui_graph_compile_failed error for missing child", missingReport.errors);
        process.exit(1);
    }
    console.log("Missing child check passed.");

    // 5. Negative Test 2: Cycle
    console.log("Running negative validation (Cycle)...");
    const cycleBundle = JSON.parse(JSON.stringify(baseBundle));
    // Create cycle: cont-1 -> btn-1 (existing)
    // Make btn-1 a container (mock type logic) 
    // We use two containers: C1 -> C2 -> C1
    
    cycleBundle.blocks["cont-2"] = {
        blockId: "cont-2",
        blockType: "ui.node.container",
        schemaVersion: "1.0.0",
        data: {
            id: "cont-2",
            type: "ui.node.container",
            children: [{ blockId: "cont-1" }]
        }
    };
    // Update C1 to point to C2
    cycleBundle.blocks["cont-1"].data.children = [{ blockId: "cont-2" }];

    const cycleReport = await validator.validateBundle(cycleBundle);
    if (cycleReport.status === "valid") {
         console.error("NG3 Failed: Expected error for cycle");
         process.exit(1);
    }
    const cycleError = cycleReport.errors.find((e: any) => e.code === "ui_graph_compile_failed" && e.message.includes("Cycle detected"));
    if (!cycleError) {
        console.error("NG3 Failed: Did not find ui_graph_compile_failed error for cycle", cycleReport.errors);
        process.exit(1);
    }
    console.log("Cycle check passed.");

    console.log("NG3 PASS");
}

run().catch(err => {
    console.error("Test Crash:", err);
    process.exit(1);
});
