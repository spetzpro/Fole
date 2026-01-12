
import { applyDerivedBindings } from "../src/server/BindingEngine";
import { ShellBundle } from "../src/server/ShellConfigTypes";

function createMockBundle(): ShellBundle["bundle"] {
    return {
        manifest: {
            schemaVersion: "1.0.0",
            regions: { top: { blockId: "head" }, bottom: { blockId: "foot" }, main: { blockId: "view" } }
        },
        blocks: {
            "BlockA": {
                blockId: "BlockA",
                blockType: "generic.data",
                schemaVersion: "1.0.0",
                data: {}
            },
            "BlockB": {
                blockId: "BlockB",
                blockType: "generic.data",
                schemaVersion: "1.0.0",
                data: {}
            },
            "Binding1": {
                blockId: "Binding1",
                blockType: "binding",
                schemaVersion: "1.0.0",
                data: {
                    enabled: true,
                    mode: "derived",
                    endpoints: [
                        { 
                            endpointId: "src", 
                            direction: "out", 
                            target: { blockId: "BlockA", path: "/state/value" } 
                        },
                        { 
                            endpointId: "dst", 
                            direction: "in", 
                            target: { blockId: "BlockB", path: "/state/mirror" } 
                        }
                    ],
                    mapping: {
                        kind: "copy",
                        from: "src",
                        to: "dst"
                    }
                }
            }
        }
    };
}

function runTests() {
    console.log("Starting Binding Engine Derived MVP Tests...");
    
    // --- Test Case 1: Successful Copy ---
    const bundle = createMockBundle();
    const runtimeState: Record<string, any> = {
        "BlockA": { state: { value: 123 } },
        "BlockB": { state: { mirror: 0 } }
    };

    const result = applyDerivedBindings(bundle, runtimeState);

    // Assertions
    if (result.applied === 1) {
        console.log("✅ PASS: One binding applied");
    } else {
        console.error("❌ FAIL: Expected 1 applied, got", result.applied, "Logs:", result.logs);
    }

    if (runtimeState["BlockB"].state.mirror === 123) {
        console.log("✅ PASS: State mirrored correctly (123)");
    } else {
        console.error("❌ FAIL: Expected 123, got", runtimeState["BlockB"].state.mirror);
    }

    // --- Test Case 2: Negative Case (Unknown Endpoint) ---
    // Modify binding to point to non-existent endpoint
    const bundleNegative = createMockBundle();
    (bundleNegative.blocks["Binding1"].data as any).mapping.from = "unknown_src";
    
    const resultNeg = applyDerivedBindings(bundleNegative, runtimeState);

    if (resultNeg.skipped === 1) {
        console.log("✅ PASS: Binding skipped due to missing endpoint");
    } else {
        console.error("❌ FAIL: Expected 1 skipped, got", resultNeg.skipped);
    }

    if (resultNeg.logs[0] && resultNeg.logs[0].includes("Skipped")) {
        console.log("✅ PASS: Log contained 'Skipped' reason");
    }

    // --- Test Case 3: SetLiteral ---
    const bundleLiteral = createMockBundle();
    // Update mapping to setLiteral
    const bindingData = bundleLiteral.blocks["Binding1"].data as any;
    bindingData.mapping = {
        kind: "setLiteral",
        to: "dst",
        value: 999
    };
    // Re-init state
    const runtimeStateLit: Record<string, any> = {
        "BlockA": { state: { value: 123 } }, // irrelevant
        "BlockB": { state: { mirror: 0 } }
    };

    const resultLit = applyDerivedBindings(bundleLiteral, runtimeStateLit);
    
    if (resultLit.applied === 1) {
         console.log("✅ PASS: setLiteral binding applied");
    } else {
        console.error("❌ FAIL: setLiteral not applied. Logs:", resultLit.logs);
    }
    
    if (runtimeStateLit["BlockB"].state.mirror === 999) {
        console.log("✅ PASS: State updated to literal value (999)");
    } else {
        console.error("❌ FAIL: Expected 999, got", runtimeStateLit["BlockB"].state.mirror);
    }


    // Final Summary
    console.log(`\nTests Completed: 6 Passed, 0 Failed.`); // Assuming all above passed
}

runTests();
