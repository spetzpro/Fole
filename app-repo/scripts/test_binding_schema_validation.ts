
import { ShellConfigValidator } from "../src/server/ShellConfigValidator";
import { ShellBundle } from "../src/server/ShellConfigTypes";

// Mock bundle valid enough to pass the outer ShellConfigValidator structural checks
function createMockBundle(bindingBlockData: any): ShellBundle["bundle"] {
    return {
        manifest: {
            schemaVersion: "1.0.0",
            regions: {}
        },
        blocks: {
            "test_binding": {
                blockId: "test_binding",
                blockType: "binding",
                schemaVersion: "1.0.0",
                data: bindingBlockData
            }
        }
    };
}

async function runTests() {
    const validator = new ShellConfigValidator(process.cwd());
    let failedTests = 0;

    console.log("=== Testing Binding Schema Validation (FAIL-CLOSED) ===");

    // Test 1: Missing Required 'mode'
    console.log("\nTEST 1: Missing required field 'mode'");
    const bundle1 = createMockBundle({
        enabled: true,
        mapping: {},
        endpoints: [
            { endpointId: "a", direction: "in", target: { blockId: "x", path: "/y" } },
            { endpointId: "b", direction: "out", target: { blockId: "z", path: "/w" } }
        ]
    });
    const report1 = await validator.validateBundle(bundle1);
    
    // We expect an error related to missing property 'mode'
    const err1 = report1.errors.find(e => e.message.includes("mode") && e.code.includes("required"));
    if (report1.status === "invalid" && err1) {
        console.log("✅ PASS: Caught missing required property 'mode'");
        console.log("   Error:", err1.message);
    } else {
        console.error("❌ FAIL: Did not catch missing 'mode'. Report:", JSON.stringify(report1, null, 2));
        failedTests++;
    }

    // Test 2: Extra Property in Endpoint Target
    console.log("\nTEST 2: Extra property in endpoint target (strict validation)");
    const bundle2 = createMockBundle({
        mode: "derived",
        enabled: true,
        mapping: {},
        endpoints: [
            { 
                endpointId: "a", 
                direction: "in", 
                target: { 
                    blockId: "x", 
                    path: "/y",
                    // ILLEGAL PROPERTY
                    extraField: "hack" 
                } 
            },
            { endpointId: "b", direction: "out", target: { blockId: "z", path: "/w" } }
        ]
    });
    
    const report2 = await validator.validateBundle(bundle2);
    const err2 = report2.errors.find(e => e.code.includes("additionalProperties") && e.path.includes("target"));

    if (report2.status === "invalid" && err2) {
        console.log("✅ PASS: Caught extra property 'extraField' in endpoint target");
        console.log("   Error:", err2.message);
    } else {
        console.error("❌ FAIL: Did not catch extra property. Report:", JSON.stringify(report2, null, 2));
        failedTests++;
    }

    if (failedTests > 0) {
        console.error(`\nFAILED: ${failedTests} tests failed.`);
        process.exit(1);
    } else {
        console.log("\nALL TESTS PASSED");
        process.exit(0);
    }
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
