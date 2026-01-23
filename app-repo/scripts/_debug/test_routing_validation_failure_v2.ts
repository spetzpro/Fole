
import { ShellConfigValidator } from "./app-repo/src/server/ShellConfigValidator";
import { ShellBundle } from "./app-repo/src/server/ShellConfigTypes";

async function testRoutingValidationFailure() {
    const validator = new ShellConfigValidator(process.cwd());

    const badBundle: ShellBundle["bundle"] = {
        manifest: {
            schemaVersion: "1.0.0",
            regions: {}
        },
        blocks: {
            "routing": {
                blockId: "routing",
                blockType: "shell.infra.routing",
                schemaVersion: "1.0.0",
                data: {
                    // Invalid: routes is an array, not a map
                    "routes": [
                        { "path": "/", "targetBlockId": "home" } 
                    ],
                    // Missing publishedLinks
                }
            }
        }
    };

    console.log("Validating bad routing block...");
    const report = await validator.validateBundle(badBundle);
    
    // Check validation status if available, or just look at errors
    const routingErrors = report.errors.filter(e => e.blockId === "routing" && e.severity === "A1");

    if (routingErrors.length > 0) {
        console.log("SUCCESS: Found expected A1 errors for routing block:");
        routingErrors.forEach(e => console.log(`  [${e.code}] ${e.message} at ${e.path}`));
    } else {
        console.error("FAILURE: Did not find expected A1 errors for routing block.");
        console.log("Report status:", report.status);
        console.log("All errors found:", report.errors);
        process.exit(1);
    }
}

testRoutingValidationFailure().catch(err => {
    console.error(err);
    process.exit(1);
});
