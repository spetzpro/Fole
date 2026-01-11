
import { ShellConfigValidator } from "../src/server/ShellConfigValidator";
import { ShellBundle } from "../src/server/ShellConfigTypes";

async function testButtonExpressionValidation() {
    console.log("Starting Button Expression Validation Test");
    const validator = new ShellConfigValidator(process.cwd());

    // Create a bundle with an invalid expression in button enabledWhen
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
            // Button with invalid enabledWhen
            "btn_bad_expr": {
                blockId: "btn_bad_expr",
                blockType: "shell.control.button.test",
                schemaVersion: "1.0.0",
                data: {
                    label: "Bad Expr",
                    enabledWhen: {
                        kind: "and",
                        exprs: "nope" // Invalid: should be array
                    }
                }
            },
            // Mock required blocks
            "header": { blockId: "header", blockType: "shell.region.header", schemaVersion: "1.0.0", data: {} },
            "footer": { blockId: "footer", blockType: "shell.region.footer", schemaVersion: "1.0.0", data: {} },
            "viewport": { blockId: "viewport", blockType: "shell.rules.viewport", schemaVersion: "1.0.0", data: {} }
        }
    };

    console.log("Validating bundle...");
    const report = await validator.validateBundle(badBundle);

    // console.log("Report errors:", JSON.stringify(report.errors, null, 2));

    const schemaError = report.errors.find(e => 
        e.code.includes("data_schema") && 
        e.blockId === "btn_bad_expr" &&
        (e.message.includes("must match exactly one schema in oneOf") || e.message.includes("must be array"))
    );

    if (schemaError) {
        console.log("✅ SUCCESS: Caught invalid button expression error as expected.");
        console.log("Error Message:", schemaError.message);
    } else {
        console.error("❌ FAILURE: Validation did NOT catch invalid button expression schema.");
        console.log("Errors found:", report.errors);
        process.exit(1);
    }
}

testButtonExpressionValidation().catch(e => {
    console.error(e);
    process.exit(1);
});
