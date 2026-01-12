
import { applyDerivedBindings } from "../src/server/BindingEngine";
import { ShellBundle } from "../src/server/ShellConfigTypes";

let passed = 0;
let failed = 0;

function assert(description: string, condition: boolean, details?: any) {
    if (condition) {
        console.log(`✅ PASS: ${description}`);
        passed++;
    } else {
        console.error(`❌ FAIL: ${description}`);
        if (details) console.error("   Details:", JSON.stringify(details, null, 2));
        failed++;
    }
}

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

    assert("One binding applied", result.applied === 1, result);
    assert("State mirrored correctly (123)", runtimeState["BlockB"].state.mirror === 123);

    // --- Test Case 2: Negative Case (Unknown Endpoint) ---
    // Modify binding to point to non-existent endpoint
    const bundleNegative = createMockBundle();
    (bundleNegative.blocks["Binding1"].data as any).mapping.from = "unknown_src";
    
    const resultNeg = applyDerivedBindings(bundleNegative, runtimeState);

    assert("Binding skipped due to missing endpoint", resultNeg.skipped === 1, resultNeg);
    assert("Log contained 'Skipped' reason", (resultNeg.logs[0] && resultNeg.logs[0].includes("Skipped")) || false);

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
    
    assert("setLiteral binding applied", resultLit.applied === 1, resultLit);
    assert("State updated to literal value (999)", runtimeStateLit["BlockB"].state.mirror === 999);

    // --- Test Case 4: Negative Case - Direction Enforcement ---
    const bundleDirection = createMockBundle();
    const bData = bundleDirection.blocks["Binding1"].data as any;
    // Set desination direction to "out" which is invalid for writing
    bData.endpoints[1].direction = "out"; 
    // And use setLiteral
    bData.mapping = {
        kind: "setLiteral",
        to: "dst", // this endpoint is now 'out'
        value: 777
    };
    
    const runtimeStateDir: Record<string, any> = {
        "BlockA": { state: { value: 123 } },
        "BlockB": { state: { mirror: 0 } }
    };

    const resultDir = applyDerivedBindings(bundleDirection, runtimeStateDir);

    // We expect applied = 0 because the only destination was skipped
    assert("Binding not applied when destination direction is invalid (out)", resultDir.applied === 0, resultDir);
    // Depending on logic, if 0 applied, it might increment skipped
    assert("Binding count (skipped or 0 applied)", resultDir.skipped === 1 || resultDir.applied === 0);
    assert("State NOT updated (remains 0)", runtimeStateDir["BlockB"].state.mirror === 0);
    // Check logs for specific warning
    const hasDirWarning = resultDir.logs.some(l => l.includes("direction invalid for writing"));
    assert("Log contains direction warning", hasDirWarning, resultDir.logs);

    // Final Summary
    console.log(`\nTests Completed: ${passed} Passed, ${failed} Failed.`);
    
    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
