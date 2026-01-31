import { createBindingRuntimeManager } from "../src/server/BindingRuntimeManager";

function assert(condition: boolean, message: string) {
    if (!condition) {
        console.error(`FAIL: ${message}`);
        process.exit(1);
    }
}

function runTest() {
    console.log("Running Runtime Single-Shot Recording Test...");

    const manager = createBindingRuntimeManager({} as any);

    manager.recordInvocation({
        ts: new Date().toISOString(),
        actionId: "open-window-manager-action",
        status: "completed",
        durationMs: 5,
        resultSummary: "opened window window_manager"
    });

    manager.recordTrace({
        ts: new Date().toISOString(),
        actionId: "open-window-manager-action",
        status: "completed",
        durationMs: 5,
        resultSummary: "opened window window_manager"
    });

    const invocations = manager.getInvocations(10);
    const traces = manager.getTraces(10);

    assert(invocations.length === 1, "Expected exactly one invocation");
    assert(traces.length === 1, "Expected exactly one trace");
    assert(invocations[0].status === "completed", "Expected invocation status to be completed");
    assert(typeof invocations[0].durationMs === "number", "Expected invocation durationMs");
    assert(traces[0].status === "completed", "Expected trace status to be completed");
    assert(typeof traces[0].durationMs === "number", "Expected trace durationMs");

    console.log("SUCCESS: Single-shot recording invariants verified.");
    process.exit(0);
}

runTest();
