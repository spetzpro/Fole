
import { ShellConfigValidator } from "../src/server/ShellConfigValidator";
import { ShellBundle } from "../src/server/ShellConfigTypes";

async function testOverlayValidation() {
    console.log("Starting Overlay Registry Validation Test");
    const validator = new ShellConfigValidator(process.cwd());

    const testBundle: ShellBundle["bundle"] = {
        manifest: {
            schemaVersion: "1.0.0",
            regions: {
                "top": { "blockId": "header" },
                "bottom": { "blockId": "footer" },
                "main": { "blockId": "viewport" }
            }
        },
        blocks: {
            // Overlay block with ID 'valid_overlay'
            "valid_overlay": {
                blockId: "valid_overlay",
                blockType: "shell.overlay.main_menu",
                schemaVersion: "1.0.0",
                data: {
                    items: []
                }
            },
            // Button trying to toggle 'invalid_overlay'
            "btn_bad": {
                blockId: "btn_bad",
                blockType: "shell.control.button.test", // Using generic button type
                schemaVersion: "1.0.0",
                data: {
                    "label": "Bad Button",
                    "interactions": {
                        "click": {
                            "kind": "toggleOverlay",
                            "params": { 
                                "overlayId": "invalid_overlay"
                            }
                        }
                    }
                }
            },
             // Button trying to toggle 'valid_overlay' (should pass)
             "btn_good": {
                blockId: "btn_good",
                blockType: "shell.control.button.test",
                schemaVersion: "1.0.0",
                data: {
                    "label": "Good Button",
                    "interactions": {
                        "click": {
                            "kind": "toggleOverlay",
                            "params": { 
                                "overlayId": "valid_overlay"
                            }
                        }
                    }
                }
            },
            // Mock regions to satisfy A1 missing_block check
            "header": { blockId: "header", blockType: "shell.region.header", schemaVersion: "1.0.0", data: {} },
            "footer": { blockId: "footer", blockType: "shell.region.footer", schemaVersion: "1.0.0", data: {} },
            "viewport": { blockId: "viewport", blockType: "shell.rules.viewport", schemaVersion: "1.0.0", data: {} }
        }
    };

    console.log("Validating bundle...");
    const report = await validator.validateBundle(testBundle);

    // console.log("Report:", JSON.stringify(report, null, 2));

    const invalidOverlayError = report.errors.find(e => e.code === "unknown_overlayId");

    if (invalidOverlayError) {
        console.log("✅ SUCCESS: Caught 'unknown_overlayId' error as expected: ", invalidOverlayError.message);
    } else {
        console.error("❌ FAILURE: Validation did NOT catch unknown overlayId.");
        console.log("Errors: ", report.errors);
        process.exit(1);
    }
    
    // Check that valid_overlay did NOT error
    const validReferenceError = report.errors.find(e => e.blockId === "btn_good");
    if (validReferenceError) {
        console.error("❌ FAILURE: Validation incorrectly flagged valid overlay reference: ", validReferenceError);
        process.exit(1);
    } else {
         console.log("✅ SUCCESS: Valid overlay reference passed.");
    }

    console.log("Test Complete.");
}

testOverlayValidation().catch(e => {
    console.error(e);
    process.exit(1);
});
