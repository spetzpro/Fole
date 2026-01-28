
import { ShellConfigDeployer } from "../../src/server/ShellConfigDeployer";
import { ShellConfigRepository } from "../../src/server/ShellConfigRepository";
import { ShellConfigValidator } from "../../src/server/ShellConfigValidator";
import * as path from "path";
import * as fs from "fs";

// NG4 Integration Test: Config Lifecycle (Draft -> Preflight -> Activate)
// Verifies that a Shell Bundle with v2 ui-node blocks can be successfully deployed.

async function run() {
    console.log("Starting NG4 Lifecycle Test...");
    
    const repoRoot = process.cwd();
    const configRoot = path.join(repoRoot, "app-repo", "config", "shell");
    
    // 1. Setup Services
    // Mock Repository (read-only parts mostly, but deployer needs it to get current active)
    const repository = new ShellConfigRepository(repoRoot); // Should work if files exist
    const validator = new ShellConfigValidator(repoRoot);
    const deployer = new ShellConfigDeployer(repository, validator, repoRoot);

    // 2. Draft Bundle (Valid shell + v2 nodes)
    const bundle: any = {
        manifest: {
            schemaVersion: "1.0.0",
            regions: {
                header: { blockId: "blk_header" },
                footer: { blockId: "blk_footer" },
                viewport: { blockId: "blk_viewport" }
            }
        },
        blocks: {
            // Mandated Shell Blocks
            "blk_header": { blockId: "blk_header", blockType: "shell.region.header", schemaVersion: "1.0.0", data: { title: "NG4 App" } },
            "blk_footer": { blockId: "blk_footer", blockType: "shell.region.footer", schemaVersion: "1.0.0", data: { copyrightText: "© NG4" } },
            "blk_viewport": { blockId: "blk_viewport", blockType: "shell.region.viewport", schemaVersion: "1.0.0", data: { rulesId: "blk_viewport_rules" } },
            "blk_viewport_rules": { blockId: "blk_viewport_rules", blockType: "shell.rules.viewport", schemaVersion: "1.0.0", data: { allowZoom: true } },
            "blk_routing": { blockId: "blk_routing", blockType: "shell.infra.routing", schemaVersion: "1.0.0", data: { routes: {}, publishedLinks: {} } },
            "blk_theme": { blockId: "blk_theme", blockType: "shell.infra.theme_tokens", schemaVersion: "1.0.0", data: { tokens: {} } },
            "blk_windows": { blockId: "blk_windows", blockType: "shell.infra.window_registry", schemaVersion: "1.0.0", data: { windows: {} } },
            "blk_main_menu": { blockId: "blk_main_menu", blockType: "shell.overlay.main_menu", schemaVersion: "1.0.0", data: { items: [] } },
            
            // V2 UI Node Graph (Container -> Button)
            "ng4-cont": {
                blockId: "ng4-cont",
                blockType: "ui.node.container",
                schemaVersion: "1.0.0",
                data: {
                    id: "ng4-cont",
                    type: "ui.node.container",
                    direction: "column",
                    children: [{ blockId: "ng4-btn" }]
                }
            },
            "ng4-btn": {
                blockId: "ng4-btn",
                blockType: "ui.node.button",
                schemaVersion: "1.0.0",
                data: {
                    id: "ng4-btn",
                    type: "ui.node.button",
                    label: "Activate Me"
                }
            }
        }
    };

    try {
        // 3. Deploy (Preflight + Activate)
        // This calls validator.validateBundle internally (which runs compileUiGraph)
        // Then writes to disk and updates active.json
        console.log("Deploying bundle...");
        const result = await deployer.deploy(bundle, "NG4 Test Deployment");
        
        console.log("Deploy Result:", JSON.stringify(result, null, 2));

        // 4. Assertions
        if (result.report.status !== "valid") {
            console.error("NG4 FAIL: Deployment returned invalid report.", result.report.errors);
            process.exit(1);
        }
        
        if (!result.activeVersionId) {
             console.error("NG4 FAIL: No activeVersionId returned.");
             process.exit(1);
        }

        // Verify Active Pointer on Disk
        const activePointerPath = path.join(configRoot, "active.json");
        const activePointer = JSON.parse(fs.readFileSync(activePointerPath, 'utf8'));
        
        console.log("Active Pointer on Disk:", activePointer);

        if (activePointer.activeVersionId !== result.activeVersionId) {
            console.error("NG4 FAIL: Disk active.json does not match returned versionId.");
            process.exit(1);
        }

        // Verify Block Existence in Archive
        const blockPath = path.join(configRoot, "archive", result.activeVersionId, "bundle", "ng4-btn.json");
        if (!fs.existsSync(blockPath)) {
            console.error("NG4 FAIL: Archived block file not found:", blockPath);
            process.exit(1);
        }

        console.log("NG4 PASS");

    } catch (err) {
        console.error("NG4 Crash:", err);
        process.exit(1);
    }
}

run().catch(err => {
    console.error("Test Harness Crash:", err);
    process.exit(1);
});
