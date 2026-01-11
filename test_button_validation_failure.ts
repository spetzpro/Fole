
import { ShellConfigValidator } from "./app-repo/src/server/ShellConfigValidator";
import { ShellBundle } from "./app-repo/src/server/ShellConfigTypes";

async function testButtonValidationFailure() {
    const validator = new ShellConfigValidator(process.cwd());

    const badBundle: ShellBundle["bundle"] = {
        manifest: {
            schemaVersion: "1.0.0",
            regions: {}
        },
        blocks: {
            "bad_btn": {
                blockId: "bad_btn",
                blockType: "shell.control.button.custom",
                schemaVersion: "1.0.0",
                data: {
                    "label": "Bad Button",
                    "interactions": {
                        "click": {
                            "kind": "invalidKind", // Fails enum
                            "params": {}
                        }
                    }
                }
            }
        }
    };

    console.log("Validating bad button block...");
    const report = await validator.validateBundle(badBundle);
    
    // Check validation status if available, or just look at errors
    const errors = report.errors.filter(e => e.blockId === "bad_btn" && e.severity === "A1");

    if (errors.length > 0) {
        console.log("SUCCESS: Found expected A1 errors for button block:");
        errors.forEach(e => console.log(`  [${e.code}] ${e.message} at ${e.path}`));
    } else {
        console.error("FAILURE: Did not find expected A1 errors for button block.");
        console.log("Report status:", report.status);
        console.log("All errors found:", report.errors);
        process.exit(1);
    }
}

testButtonValidationFailure().catch(err => {
    console.error(err);
    process.exit(1);
});
