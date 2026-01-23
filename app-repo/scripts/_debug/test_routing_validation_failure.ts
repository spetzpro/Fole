
import { ShellConfigValidator } from "./app-repo/src/server/ShellConfigValidator";
import { ShellBundle } from "./app-repo/src/server/ShellConfigTypes";
import * as path from "path";

async function testRoutingValidationFailure() {
    const validator = new ShellConfigValidator(process.cwd());

    const badBundle: ShellBundle["bundle"] = {
        manifest: {
            appId: "test-app",
            version: "1.0.0",
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
    
    // We expect errors because routes is array -> object expected
    // And missing publishedLinks
    const routingErrors = report.filter(e => e.blockId === "routing" && e.severity === "A1");

    if (routingErrors.length > 0) {
        console.log("SUCCESS: Found expected A1 errors for routing block:");
        routingErrors.forEach(e => console.log(`  [${e.code}] ${e.message} at ${e.path}`));
    } else {
        console.error("FAILURE: Did not find expected A1 errors for routing block.");
        console.log("All errors found:", report);
        process.exit(1);
    }
}

testRoutingValidationFailure().catch(err => {
    console.error(err);
    process.exit(1);
});
