
import { ShellConfigValidator } from "../src/server/ShellConfigValidator";
import { ShellBundle } from "../src/server/ShellConfigTypes";
import * as path from "path";

// Mock Bundle Factory
function createMockBundle(): ShellBundle["bundle"] {
    return {
        manifest: {
            schemaVersion: "1.0.0",
            regions: {
                top: { blockId: "header_1" },
                bottom: { blockId: "footer_1" },
                main: { blockId: "viewport_1" }
            }
        },
        blocks: {
            "header_1": {
                blockId: "header_1",
                blockType: "shell.region.header",
                schemaVersion: "1.0.0",
                data: {}
            },
            "footer_1": {
                blockId: "footer_1",
                blockType: "shell.region.footer",
                schemaVersion: "1.0.0",
                data: {}
            },
            "viewport_1": {
                blockId: "viewport_1",
                blockType: "shell.rules.viewport",
                schemaVersion: "1.0.0",
                data: {}
            },
            "routing_1": {
                blockId: "routing_1",
                blockType: "shell.infra.routing",
                schemaVersion: "1.0.0",
                data: {}
            },
            "theme_1": {
                blockId: "theme_1",
                blockType: "shell.infra.theme_tokens",
                schemaVersion: "1.0.0",
                data: {}
            },
            "window_registry_1": {
                blockId: "window_registry_1",
                blockType: "shell.infra.window_registry",
                schemaVersion: "1.0.0",
                data: { windows: {} }
            },
            "main_menu_1": {
                blockId: "main_menu_1",
                blockType: "shell.overlay.main_menu",
                schemaVersion: "1.0.0",
                data: {}
            }
        }
    };
}

async function runTests() {
    console.log("Starting Manifest Required Blocks Validation Tests...");
    const validator = new ShellConfigValidator(path.resolve(__dirname, "../../"));

    // Case 1: Wrong Block Type Reference
    // header block exists but manifest.regions.top points to footer check
    console.log("\nTest Case 1: Manifest region points to wrong block type");
    const bundle1 = createMockBundle();
    // Point top region to footer block
    if (bundle1.manifest.regions.top) {
        bundle1.manifest.regions.top.blockId = "footer_1"; 
    }
    
    const report1 = await validator.validateBundle(bundle1);
    const error1 = report1.errors.find(e => e.code === "shell_manifest_wrong_block_type");
    
    if (error1) {
        console.log("PASS: Detected wrong block type error:", JSON.stringify(error1, null, 2));
    } else {
        console.log("FAIL: Did not detect wrong block type. Errors found:", JSON.stringify(report1.errors, null, 2));
    }

    // Case 2: Missing Window Registry (Required Block Type Missing)
    console.log("\nTest Case 2: Missing required block (window_registry)");
    const bundle2 = createMockBundle();
    delete bundle2.blocks["window_registry_1"];
    
    const report2 = await validator.validateBundle(bundle2);
    // Looking for a generic "missing required block type" error. 
    // The requirement A didn't specify code, but let's assume 'shell_missing_required_block'.
    // Or we'll just print what we find. The requirement says "Required blockTypes MUST exist".
    // I will implement code: 'shell_missing_required_block'
    const error2 = report2.errors.find(e => e.message.includes("shell.infra.window_registry"));
    
    if (error2) {
        console.log("PASS: Detected missing required block:", JSON.stringify(error2, null, 2));
    } else {
        console.log("FAIL: Did not detect missing window registry. Errors found:", JSON.stringify(report2.errors, null, 2));
    }

    // Case 3: Required block exists but not referenced
    // (Requirement D: "If required blockType exists but is not referenced where required")
    console.log("\nTest Case 3: Required block exists but not referenced correcty");
    const bundle3 = createMockBundle();
    // Manifest top is missing, but header block exists
    delete bundle3.manifest.regions.top;
    
    const report3 = await validator.validateBundle(bundle3);
    const error3 = report3.errors.find(e => e.code === "shell_manifest_missing_required_reference");

    if (error3) {
        console.log("PASS: Detected missing required reference:", JSON.stringify(error3, null, 2));
    } else {
         console.log("FAIL: Did not detect missing reference when block exists. Errors found:", JSON.stringify(report3.errors, null, 2));
    }
}

runTests().catch(err => console.error(err));
