 
import { BindingRuntime } from "../src/server/BindingRuntime";
import { ShellBundle } from "../src/server/ShellConfigTypes";
import { TriggerEvent, TriggerContext } from "../src/server/TriggeredBindingEngine";

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
            "SourceBlock": {
                blockId: "SourceBlock",
                blockType: "generic.data",
                schemaVersion: "1.0.0",
                data: {}
            },
            "TargetBlock": {
                blockId: "TargetBlock",
                blockType: "generic.data",
                schemaVersion: "1.0.0",
                data: {}
            },
            // Derived Binding: Copy SourceBlock state to TargetBlock derived_val
            "DerivedBinding": {
                blockId: "DerivedBinding",
                blockType: "binding",
                schemaVersion: "1.0.0",
                data: {
                    enabled: true,
                    mode: "derived",
                    endpoints: [
                        { endpointId: "src", direction: "out", target: { blockId: "SourceBlock", path: "/state/val" } },
                        { endpointId: "dst", direction: "in", target: { blockId: "TargetBlock", path: "/state/derived_val" } }
                    ],
                    mapping: { kind: "copy", from: "src", to: "dst" }
                }
            },
            // Triggered Binding: On 'ping', set literal to TargetBlock triggered_val
            "TriggeredBinding": {
                blockId: "TriggeredBinding",
                blockType: "binding",
                schemaVersion: "1.0.0",
                data: {
                    enabled: true,
                    mode: "triggered",
                    endpoints: [
                        { endpointId: "dst", direction: "in", target: { blockId: "TargetBlock", path: "/state/triggered_val" } }
                    ],
                    mapping: { 
                        trigger: { sourceBlockId: "SourceBlock", name: "ping" },
                        kind: "setLiteral", 
                        to: "dst", 
                        value: "pong" 
                    },
                    accessPolicy: { 
                        expr: { 
                            kind: "ref", 
                            refType: "permission", 
                            key: "can_ping" 
                        } 
                    }
                }
            }
        }
    };
}

async function runTests() {
    console.log("--- Starting BindingRuntime Integration Tests ---");

    const bundle = createMockBundle();
    const runtimeState: Record<string, any> = {
        "SourceBlock": { state: { val: "initial" } },
        "TargetBlock": { state: { derived_val: null, triggered_val: null } }
    };

    // 1. Initialize Runtime
    const rt = new BindingRuntime(bundle, runtimeState);
    assert("Runtime initialized", !!rt);

    // 2. Test Derived Tick
    const resDerived = rt.applyDerivedTick();
    assert("Derived tick applied 1 binding", resDerived.applied === 1, resDerived);
    assert("State updated by derived tick", runtimeState["TargetBlock"].state.derived_val === "initial");
    
    // 3. Test Triggered Event
    const evt: TriggerEvent = {
        sourceBlockId: "SourceBlock",
        name: "ping",
        sourcePath: "/",
        payload: {}
    };
    const ctx: TriggerContext = {
        permissions: new Set(["can_ping"]),
        roles: new Set()
    };

    const resTriggered = rt.dispatchEvent(evt, ctx);
    assert("Triggered dispatch applied 1 binding", resTriggered.applied === 1, resTriggered);
    assert("State updated by triggered binding", runtimeState["TargetBlock"].state.triggered_val === "pong");

    // 4. Test Derived Update after Mutation (Simulate flow)
    // Update source
    runtimeState["SourceBlock"].state.val = "updated";
    const resDerived2 = rt.applyDerivedTick();
    assert("Derived tick re-applied", resDerived2.applied === 1);
    assert("State updated to new value", runtimeState["TargetBlock"].state.derived_val === "updated");

    // 5. Test Re-entrancy (Fail-Closed)
    // Manually lock to simulate nesting
    (rt as any).lock = true;
    
    const resReentrancy = rt.applyDerivedTick();
    assert("Re-entrancy blocked execution (applied=0)", resReentrancy.applied === 0);
    assert("Re-entrancy marked as skipped=1", resReentrancy.skipped === 1);
    assert("Re-entrancy log present", resReentrancy.logs.some(l => l.includes("re-entrancy detected")), resReentrancy.logs);

    // Unlock for good measure (though test ends here)
    (rt as any).lock = false;

    console.log(`\nResults: ${passed} Passed, ${failed} Failed`);
    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
