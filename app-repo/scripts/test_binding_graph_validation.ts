
import { ShellConfigValidator } from "../src/server/ShellConfigValidator";
import { ShellBundle } from "../src/server/ShellConfigTypes";

function createBundle(bindings: any[], blocks: Record<string, any> = {}): ShellBundle["bundle"] {
    const bundleBlocks: Record<string, any> = { ...blocks };
    
    // Add bindings
    bindings.forEach((b, i) => {
        bundleBlocks[`binding_${i}`] = {
            blockId: `binding_${i}`,
            blockType: "binding",
            schemaVersion: "1.0.0",
            data: b
        };
    });

    return {
        manifest: { schemaVersion: "1.0.0", regions: {} },
        blocks: bundleBlocks
    };
}

async function runTests() {
    const validator = new ShellConfigValidator(process.cwd());
    let failedTests = 0;

    console.log("=== Testing Binding Graph Validation (Logical) ===");

    // Test 1: Missing Target Block
    console.log("\nTEST 1: Missing Target Block");
    const bundle1 = createBundle([
        {
            mode: "derived",
            enabled: true,
            mapping: {}, // Schema checked elsewhere
            endpoints: [
                { endpointId: "src", direction: "in", target: { blockId: "EXISTING_BTN", path: "/data" } },
                { endpointId: "dst", direction: "out", target: { blockId: "MISSING_BTN", path: "/data" } }
            ]
        }
    ], {
        "EXISTING_BTN": { blockId: "EXISTING_BTN", blockType: "shell.control.button", data: {} }
    });

    const rep1 = await validator.validateBundle(bundle1);
    const err1 = rep1.errors.find(e => e.code === "binding_missing_target_block");
    
    if (rep1.status === "invalid" && err1) {
        console.log("✅ PASS: Caught missing target block.");
        console.log("   Msg:", err1.message);
    } else {
        console.error("❌ FAIL: Failed to catch missing block.");
        console.log(JSON.stringify(rep1, null, 2));
        failedTests++;
    }

    // Test 2: Cycle Detection
    // A -> Binding0 -> B
    // B -> Binding1 -> A
    console.log("\nTEST 2: Derived Cycle Detection");
    const bundle2 = createBundle(
        [
            // Binding 0: A(in) -> B(out)
            {
                mode: "derived",
                enabled: true,
                mapping: {},
                endpoints: [
                    { endpointId: "in", direction: "in", target: { blockId: "BlockA", path: "/val" } },
                    { endpointId: "out", direction: "out", target: { blockId: "BlockB", path: "/val" } }
                ]
            },
            // Binding 1: B(in) -> A(out)
            {
                mode: "derived",
                enabled: true,
                mapping: {},
                endpoints: [
                    { endpointId: "in", direction: "in", target: { blockId: "BlockB", path: "/val" } },
                    { endpointId: "out", direction: "out", target: { blockId: "BlockA", path: "/val" } }
                ]
            }
        ],
        {
            "BlockA": { blockId: "BlockA", blockType: "shell.control.button", data: {} },
            "BlockB": { blockId: "BlockB", blockType: "shell.control.button", data: {} }
        }
    );

    const rep2 = await validator.validateBundle(bundle2);
    const err2 = rep2.errors.find(e => e.code === "binding_cycle_detected");

    if (rep2.status === "invalid" && err2) {
        console.log("✅ PASS: Caught derived cycle.");
        console.log("   Msg:", err2.message);
    } else {
        console.error("❌ FAIL: Failed to catch cycle.");
        console.log(JSON.stringify(rep2, null, 2));
        failedTests++;
    }

    if (failedTests > 0) process.exit(1);
    else console.log("\nALL TESTS PASSED");
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
