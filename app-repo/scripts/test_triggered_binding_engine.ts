
import { dispatchTriggeredBindings, TriggerEvent, TriggerContext } from "../src/server/TriggeredBindingEngine";
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
            }
        }
    };
}

function createBindingBlock(id: string, mapping: any, accessPolicy?: any): any {
    return {
        blockId: id,
        blockType: "binding",
        schemaVersion: "1.0.0",
        data: {
            enabled: true,
            mode: "triggered",
            endpoints: [
                {
                    endpointId: "dst",
                    direction: "in",
                    target: { blockId: "BlockB", path: "/state/value" }
                }
            ],
            mapping: mapping,
            accessPolicy: accessPolicy
        }
    };
}

async function runTests() {
    console.log("--- Starting Triggered Binding Engine Tests ---");

    // Case 1: Trigger match -> setLiteral updates runtimeState
    {
        const bundle = createMockBundle();
        bundle.blocks["Binding1"] = createBindingBlock("Binding1", {
            trigger: { sourceBlockId: "BlockA", name: "click" },
            kind: "setLiteral",
            to: "dst",
            value: 123
        });

        const state: Record<string, any> = {
            "BlockA": {},
            "BlockB": { state: { value: 0 } }
        };

        const evt: TriggerEvent = {
            sourceBlockId: "BlockA",
            name: "click",
            sourcePath: "/",
            payload: {}
        };

        const ctx: TriggerContext = {
            permissions: new Set(),
            roles: new Set()
        };

        const result = dispatchTriggeredBindings(bundle, state, evt, ctx);
        
        assert("Case 1: Binding should be applied", result.applied === 1);
        assert("Case 1: State should be updated to 123", state["BlockB"].state.value === 123);
    }

    // Case 2: Access policy failure
    {
        const bundle = createMockBundle();
        bundle.blocks["Binding2"] = createBindingBlock("Binding2", {
            trigger: { sourceBlockId: "BlockA", name: "click" },
            kind: "setLiteral",
            to: "dst",
            value: 999
        }, { expr: "admin_only" }); // Requires 'admin_only' permission

        const state: Record<string, any> = {
            "BlockA": {},
            "BlockB": { state: { value: 0 } }
        };

        const evt: TriggerEvent = {
            sourceBlockId: "BlockA",
            name: "click",
            sourcePath: "/",
            payload: {}
        };

        const ctx: TriggerContext = {
            permissions: new Set(["user_only"]), // Lacks 'admin_only'
            roles: new Set()
        };

        const result = dispatchTriggeredBindings(bundle, state, evt, ctx);

        assert("Case 2: Binding should be skipped due to access policy", result.skipped === 1 && result.applied === 0);
        assert("Case 2: State should NOT be updated", state["BlockB"].state.value === 0);
        assert("Case 2: Logs should indicate access policy failure", !!(result.logs.length > 0 && result.logs[0].includes("Access policy")));
    }

    // Case 3: setFromPayload writes payload value
    {
         const bundle = createMockBundle();
         bundle.blocks["Binding3"] = createBindingBlock("Binding3", {
             trigger: { sourceBlockId: "BlockA", name: "signal" },
             kind: "setFromPayload",
             to: "dst",
             payloadPath: "/data/score"
         });
 
         const state: Record<string, any> = {
             "BlockA": {},
             "BlockB": { state: { value: 0 } }
         };
 
         const evt: TriggerEvent = {
             sourceBlockId: "BlockA",
             name: "signal",
             sourcePath: "/",
             payload: { data: { score: 500 } }
         };
 
         const ctx: TriggerContext = {
             permissions: new Set(),
             roles: new Set()
         };
 
         const result = dispatchTriggeredBindings(bundle, state, evt, ctx);
 
         assert("Case 3: Binding should be applied", result.applied === 1);
         assert("Case 3: State should be updated from payload (500)", state["BlockB"].state.value === 500);
    }
    
    // Case 4: No Match (Wrong Event Name)
    {
         const bundle = createMockBundle();
         bundle.blocks["Binding4"] = createBindingBlock("Binding4", {
             trigger: { sourceBlockId: "BlockA", name: "click" },
             kind: "setLiteral",
             to: "dst",
             value: 777
         });

         const state: Record<string, any> = { "BlockA": {}, "BlockB": { state: { value: 0 } } };
         const evt: TriggerEvent = {
             sourceBlockId: "BlockA",
             name: "hover", // Wrong name
             sourcePath: "/",
             payload: {}
         };
         const ctx: TriggerContext = { permissions: new Set(), roles: new Set() };

         const result = dispatchTriggeredBindings(bundle, state, evt, ctx);
         assert("Case 4: Binding should be ignored (no match)", result.applied === 0 && result.skipped === 0); // Not counted as skipped because it didn't match trigger
    }

    console.log(`\nResults: ${passed} Passed, ${failed} Failed`);
    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
