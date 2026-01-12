import { dispatchActionEvent, BindingRuntimeDispatch } from "../src/server/ActionDispatcher";
import { TriggerEvent, TriggerContext, TriggeredBindingResult } from "../src/server/TriggeredBindingEngine";

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

async function runTests() {
    console.log("--- Starting ActionDispatcher Tests ---");

    const ctx: TriggerContext = {
        permissions: new Set(),
        roles: new Set()
    };

    // Test 1: BindingRuntime Undefined
    console.log("\n[Test 1] Runtime Undefined");
    const res1 = dispatchActionEvent(undefined, "btn1", "click", {}, ctx);
    
    assert("Returns 0 applied", res1.applied === 0);
    assert("Returns 1 skipped", res1.skipped === 1);
    assert("Log contains A1 drop message", res1.logs.some(l => l.includes("A1: [Action] Dropped")));

    // Test 2: BindingRuntime Present
    console.log("\n[Test 2] Runtime Present");
    
    let receivedEvent: TriggerEvent | undefined;
    
    const mockRuntime: BindingRuntimeDispatch = {
        dispatchEvent(evt, _ctx) {
            receivedEvent = evt;
            return { applied: 1, skipped: 0, logs: ["ok"] };
        }
    };

    const res2 = dispatchActionEvent(mockRuntime, "btn2", "submit", { foo: "bar" }, ctx);

    assert("Returns result from runtime", res2.applied === 1 && res2.skipped === 0);
    assert("Passed correct sourceBlockId", receivedEvent?.sourceBlockId === "btn2");
    assert("Passed correct actionName", receivedEvent?.name === "submit");
    assert("Set default sourcePath to /", receivedEvent?.sourcePath === "/");
    assert("Passed payload", receivedEvent?.payload.foo === "bar");

    console.log(`\nResults: ${passed} Passed, ${failed} Failed`);
    if (failed > 0) process.exit(1);
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
