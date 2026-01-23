
import { ShellConfigValidator } from "../../src/server/ShellConfigValidator";
// We don't import ShellBundle type to avoid type mismatches with strict TS if definition varies.
// We construct an object that satisfies the validator's expectations.
import * as path from "path";

// NG2 Integration Test: Verifies that ui-node schemas (found in schemas/ui-node)
// are correctly loaded and applied by the ShellConfigValidator during preflight checks.

async function run() {
    console.log("Starting NG2 V2 ui-node integration test...");
    
    // 1. Setup Validator
    const repoRoot = process.cwd(); 
    const validator = new ShellConfigValidator(repoRoot);
    
    // 2. Construct Valid Bundle (Inner Bundle Object)
    // The Validator expects the "bundle" property of the full ShellBundle.
    // Structure: { manifest: { ... }, blocks: { ... } }
    
    const bundle = {
        manifest: {
            schemaVersion: "1.0.0",
            regions: {
                // Validator requires these regions to exist and use { blockId } format
                header: { blockId: "blk_header" },
                footer: { blockId: "blk_footer" },
                viewport: { blockId: "blk_viewport" }
            }
        },
        blocks: {
            // -- Mock Mandated Shell Blocks --
            "blk_header": {
                blockId: "blk_header",
                blockType: "shell.region.header",
                schemaVersion: "1.0.0",
                data: { title: "Test App" }
            },
            "blk_footer": {
                blockId: "blk_footer",
                blockType: "shell.region.footer",
                schemaVersion: "1.0.0",
                data: { copyrightText: "© 2026" }
            },
            "blk_viewport": {
                blockId: "blk_viewport",
                blockType: "shell.rules.viewport", // Corrected
                schemaVersion: "1.0.0",
                data: { allowZoom: true }
            },
            "blk_routing": {
                blockId: "blk_routing",
                blockType: "shell.infra.routing",
                schemaVersion: "1.0.0",
                data: {
                    routes: {},
                    publishedLinks: {}
                }
            },
            "blk_theme": {
                blockId: "blk_theme",
                blockType: "shell.infra.theme_tokens", // Corrected
                schemaVersion: "1.0.0",
                data: { tokens: {} }
            },
            "blk_windows": {
                blockId: "blk_windows",
                blockType: "shell.infra.window_registry",
                schemaVersion: "1.0.0",
                data: { windows: {} }
            },
            "blk_main_menu": {
                blockId: "blk_main_menu",
                blockType: "shell.overlay.main_menu",
                schemaVersion: "1.0.0",
                data: { items: [] }
            },
            
            // -- The Target V2 Node --
            "btn-test-1": {
                blockId: "btn-test-1",
                blockType: "ui.node.button",
                schemaVersion: "1.0.0",
                // Note: v2 node schemas require identity fields in data payload too
                data: {
                    id: "btn-test-1",
                    type: "ui.node.button",
                    label: "NG2 Button",
                    variant: "primary"
                }
            }
        }
    } as any; // Cast as any to avoid strict interface mismatches during test setup

    // 3. Positive Test
    console.log("Running positive validation...");
    const report = await validator.validateBundle(bundle);
    
    if (report.status !== "valid") {
        console.error("NG2 Positive Test Failed:", JSON.stringify(report.errors, null, 2));
        process.exit(1);
    }
    
    // 4. Negative Test: Remove 'label' from valid button
    console.log("Running negative validation (missing label condition)...");
    const badBundle = JSON.parse(JSON.stringify(bundle));
    delete badBundle.blocks["btn-test-1"].data.label;
    
    const badReport = await validator.validateBundle(badBundle);
    if (badReport.status === "valid") {
        console.error("NG2 Negative Test Failed: Expected error for missing label");
        process.exit(1);
    }
    
    // Verify checks for btn-test-1 specifically
    const hasButtonError = badReport.errors.some((e: any) => e.blockId === "btn-test-1");
    if (!hasButtonError) {
         console.error("NG2 Negative Test Failed: Error was not attributed to btn-test-1", badReport.errors);
         process.exit(1);
    }

    console.log("NG2 PASS");
}

run().catch(err => {
    console.error("Test Crash:", err);
    process.exit(1);
});
