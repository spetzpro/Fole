import { applyDerivedTickFromBundle } from '../src/core/ui/DerivedTickEvaluator';

function runTest() {
    console.log("--- Starting DerivedTickEvaluator Unit Test ---");

    // 1. Setup Bundle
    const bundle = {
        blocks: {
            "SourceBlock": { blockId: "SourceBlock", blockType: "generic.data", data: {} },
            "TargetBlock": { blockId: "TargetBlock", blockType: "generic.data", data: {} },
            "DerivedBinding": { 
                blockId: "DerivedBinding", 
                blockType: "binding", 
                data: {
                    mode: "derived",
                    enabled: true,
                    endpoints: [
                        { endpointId: "src", direction: "out", target: { blockId: "SourceBlock", path: "/state/val" } },
                        { endpointId: "dst", direction: "in", target: { blockId: "TargetBlock", path: "/state/derived_val" } }
                    ],
                    mapping: {
                        kind: "copy",
                        from: "src",
                        to: "dst"
                    }
                }
            },
            "LiteralBinding": {
                blockId: "LiteralBinding",
                blockType: "binding",
                data: {
                    mode: "derived",
                    enabled: true,
                    endpoints: [
                        { endpointId: "dst", direction: "in", target: { blockId: "TargetBlock", path: "/state/literal_val" } }
                    ],
                    mapping: {
                        kind: "setLiteral",
                        to: "dst",
                        value: "FIXED"
                    }
                }
            }
        }
    };

    // 2. Setup Runtime State (Mock)
    const runtimeState: Record<string, any> = {
        "SourceBlock": { state: { val: "A" } },
        "TargetBlock": { state: {} }
    };

    // 3. Execution
    console.log("Applying tick...");
    const result = applyDerivedTickFromBundle(bundle, runtimeState);

    // 4. Assertions
    console.log("Result:", result);

    if (result.applied !== 2) { // 1 copy + 1 literal
        throw new Error(`Expected included bindings to apply (2), got ${result.applied}`);
    }

    if (result.skipped !== 0) {
        throw new Error(`Expected 0 skipped, got ${result.skipped}. Logs: ${result.logs.join(', ')}`);
    }

    // Verify State
    if (runtimeState["TargetBlock"].state.derived_val !== "A") {
        throw new Error(`Expected copy value "A", got "${runtimeState["TargetBlock"].state.derived_val}"`);
    }

    if (runtimeState["TargetBlock"].state.literal_val !== "FIXED") {
        throw new Error(`Expected literal value "FIXED", got "${runtimeState["TargetBlock"].state.literal_val}"`);
    }

    // 5. Test Invalid/Missing
    console.log("Testing invalid config...");
    const invalidBundle = {
        blocks: {
            "BadBinding": {
                blockId: "BadBinding",
                blockType: "binding",
                data: {
                    mode: "derived",
                    enabled: true,
                    mapping: { kind: "copy", from: "missing", to: "missing" },
                    endpoints: []
                }
            }
        }
    };
    const res2 = applyDerivedTickFromBundle(invalidBundle, {});
    if (res2.skipped !== 1) throw new Error("Expected 1 skipped for invalid binding");
    if (res2.logs.length === 0) throw new Error("Expected logs for invalid binding");
    console.log("Invalid test logs (expected):", res2.logs);

    console.log("✅ ALL UNIT TESTS PASSED");
}

try {
    runTest();
} catch (e: any) {
    console.error("❌ TEST FAILED:", e.message);
    process.exit(1);
}
