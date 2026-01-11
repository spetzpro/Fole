
import { ShellConfigValidator } from "../src/server/ShellConfigValidator";
import { ShellBundle } from "../src/server/ShellConfigTypes";

async function testRoutingExpressionValidation() {
    console.log("Starting Routing Expression Validation Test");
    const validator = new ShellConfigValidator(process.cwd());

    // Create a bundle with an invalid expression in routing accessPolicy
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
            "routing": {
                blockId: "routing",
                blockType: "shell.infra.routing",
                schemaVersion: "1.0.0",
                data: {
                    publishedLinks: [],
                    routes: {
                        "protected": {
                           label: "Protected",
                           targetBlockId: "some_feature",
                           accessPolicy: {
                               // Invalid expression: exprs must be an array
                               expr: {
                                   kind: "and",
                                   exprs: "not-an-array"
                               }
                           }
                        }
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

    // We expect a schema validation error for the routing block
    const schemaError = report.errors.find(e => 
        e.code.includes("data_schema") && 
        e.blockId === "routing" &&
        // The error message from previous output shows "must match exactly one schema in oneOf"
        // and also individual branch errors like "must be array".
        // We will look for the oneOf failure which is the top-level error for expressions.
        (e.message.includes("must match exactly one schema in oneOf") || e.message.includes("must be array"))
    );

    if (schemaError) {
        console.log("✅ SUCCESS: Caught invalid expression error as expected.");
        console.log("Error Message:", schemaError.message);
    } else {
        console.error("❌ FAILURE: Validation did NOT catch invalid expression schema.");
        console.log("Errors found:", report.errors);
        process.exit(1);
    }
}

testRoutingExpressionValidation().catch(e => {
    console.error(e);
    process.exit(1);
});
