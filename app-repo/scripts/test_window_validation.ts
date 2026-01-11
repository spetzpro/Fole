
import { ShellConfigValidator } from "../src/server/ShellConfigValidator";
import { ShellBundle } from "../src/server/ShellConfigTypes";

async function testWindowValidation() {
    console.log("Starting Window Registry Validation Test");
    const validator = new ShellConfigValidator(process.cwd());

    const badBundle: ShellBundle["bundle"] = {
        manifest: {
            schemaVersion: "1.0.0",
            regions: {
                "top": { "blockId": "header" },
                "bottom": { "blockId": "footer" },
                "main": { "blockId": "viewport" }
            }
        },
        blocks: {
            // Registry with 'valid_window'
            "registry": {
                blockId: "registry",
                blockType: "shell.infra.window_registry",
                schemaVersion: "1.0.0",
                data: {
                    "windows": {
                        "valid_window": { "mode": "singleton" }
                    }
                }
            },
            // Button trying to open 'invalid_window'
            "btn_bad": {
                blockId: "btn_bad",
                blockType: "shell.control.button.test",
                schemaVersion: "1.0.0",
                data: {
                    "label": "Bad Button",
                    "interactions": {
                        "click": {
                            "kind": "openWindow",
                            "params": { 
                                "windowKey": "invalid_window",
                                "mode": "singleton"
                            }
                        }
                    }
                }
            },
             // Button trying to open 'valid_window' (should pass)
             "btn_good": {
                blockId: "btn_good",
                blockType: "shell.control.button.test",
                schemaVersion: "1.0.0",
                data: {
                    "label": "Good Button",
                    "interactions": {
                        "click": {
                            "kind": "openWindow",
                            "params": { 
                                "windowKey": "valid_window",
                                "mode": "singleton"
                            }
                        }
                    }
                }
            }
        }
    };

    console.log("Validating bundle with unknown window key...");
    const report = await validator.validateBundle(badBundle);
    
    // Look for error on btn_bad
    const badErrors = report.errors.filter((e: any) => e.blockId === "btn_bad" && e.code === "unknown_windowKey");
    const goodErrors = report.errors.filter((e: any) => e.blockId === "btn_good");

    if (badErrors.length === 1 && goodErrors.length === 0) {
        console.log("SUCCESS: Caught expected unknown_windowKey error:");
        console.log(`  ${badErrors[0].message}`);
    } else {
        console.error("FAILURE: Validation did not behave as expected.");
        console.log("Bad Errors (expected 1):", badErrors);
        console.log("Good Errors (expected 0):", goodErrors);
        console.log("All Errors:", report.errors);
        process.exit(1);
    }
}

testWindowValidation().catch(err => {
    console.error(err);
    process.exit(1);
});
