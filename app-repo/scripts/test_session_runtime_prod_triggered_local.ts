
import { createSessionRuntime, SessionRuntime } from '../src/core/ui/SessionRuntime';

// Fake Client Runtime
const fakeClient: any = {
    config: { baseUrl: "", devMode: false },
    loadActiveBundle: async () => {
        return {
            bundle: {
                manifest: {
                    schemaVersion: "1.0.0",
                    regions: { top: { blockId: "head" }, main: { blockId: "view" }, bottom: { blockId: "foot" } }
                },
                blocks: {
                    // Infra Blocks
                    "head": { schemaVersion: "1.0.0", blockId: "head", blockType: "shell.region.header", data: { title: "Test" } },
                    "view": { schemaVersion: "1.0.0", blockId: "view", blockType: "shell.rules.viewport", data: { allowZoom: true } },
                    "foot": { schemaVersion: "1.0.0", blockId: "foot", blockType: "shell.region.footer", data: { copyrightText: "Test" } },
                    "infra_routing": { 
                        schemaVersion: "1.0.0", 
                        blockId: "infra_routing", 
                        blockType: "shell.infra.routing", 
                        data: { 
                            routes: {
                                "ping": { enabled: true, targetBlockId: "view", label: "Ping", accessPolicy: { anonymous: true } }
                            }, 
                            publishedLinks: {} 
                        } 
                    },
                    "infra_theme": { schemaVersion: "1.0.0", blockId: "infra_theme", blockType: "shell.infra.theme_tokens", data: { tokens: {} } },
                    "infra_windows": { schemaVersion: "1.0.0", blockId: "infra_windows", blockType: "shell.infra.window_registry", data: { windows: {} } },
                    "overlay_menu": { schemaVersion: "1.0.0", blockId: "overlay_menu", blockType: "shell.overlay.main_menu", data: { items: [] } },
                    
                    // Logic Blocks
                    "X": { schemaVersion: "1.0.0", blockId: "X", blockType: "generic.data", data: {} },
                    "TargetBlock": { 
                        schemaVersion: "1.0.0", 
                        blockId: "TargetBlock",
                        blockType: "generic.data", 
                        data: { state: { triggered_val: "initial" } } 
                    },
                    // Triggered Binding
                    "TriggeredBinding": {
                        schemaVersion: "1.0.0",
                        blockId: "TriggeredBinding",
                        blockType: "binding",
                        data: {
                            mode: "triggered",
                            enabled: true,
                            endpoints: [
                                { endpointId: "dst", direction: "in", target: { blockId: "TargetBlock", path: "/state/triggered_val" } },
                                { endpointId: "src", direction: "out", target: { blockId: "X", path: "/data" } }
                            ],
                            mapping: {
                                trigger: { sourceBlockId: "X", name: "ping" },
                                kind: "setLiteral",
                                to: "dst",
                                value: "pong"
                            },
                            accessPolicy: { 
                                expr: { kind: "ref", refType: "permission", key: "can_ping" } 
                            }
                        }
                    }
                }
            }
        };
    },
    resolveRoute: async (slug: string) => {
        return { allowed: true, status: 200, targetBlockId: "view" };
    },
    dispatchDebugAction: async () => { throw new Error("Should not be called in prod"); },
    dispatchDebugDerivedTick: async () => { throw new Error("Should not be called in prod"); }
};

async function runTest() {
    try {
        console.log("Starting Local Prod Triggered Test...");

        // 1. Create Session
        const session = await createSessionRuntime(fakeClient, "ping");
        
        // 2. Seed State (SessionRuntime internal state)
        const st = session.__debugGetRuntimeState();
        if (!st["TargetBlock"]) st["TargetBlock"] = { state: {} };
        st["TargetBlock"].state.triggered_val = "initial";

        // 3. Positive Test (With Permission)
        console.log("Dispatching 'ping' with permission 'can_ping'...");
        const res = await session.dispatchAction({ 
            sourceBlockId: "X", 
            actionName: "ping", 
            permissions: ["can_ping"] 
        });

        if (res.applied !== 1) {
            console.error("Result:", res);
            throw new Error(`Expected applied=1, got ${res.applied}`);
        }
        
        if (st["TargetBlock"].state.triggered_val !== "pong") {
            throw new Error(`Expected TargetBlock value 'pong', got '${st["TargetBlock"].state.triggered_val}'`);
        }
        console.log("Positive test passed.");

        // Reset state for negative test (though logic should just not apply)
        st["TargetBlock"].state.triggered_val = "reset";

        // 4. Negative Test (No Permission)
        console.log("Dispatching 'ping' WITHOUT permission...");
        const res2 = await session.dispatchAction({ 
            sourceBlockId: "X", 
            actionName: "ping" 
            // no permissions sent
        });

        if (res2.applied !== 0) {
            console.error("Result:", res2);
            throw new Error(`Expected applied=0, got ${res2.applied}`);
        }
        
        if (res2.skipped < 1) {
            console.error("Result:", res2);
            throw new Error(`Expected skipped >= 1, got ${res2.skipped}`);
        }

        if (st["TargetBlock"].state.triggered_val !== "reset") {
             throw new Error("State should not have changed in negative test");
        }
        console.log("Negative test passed.");

        console.log("✅ SESSION PROD LOCAL TRIGGERED PASSED");
        process.exit(0);

    } catch (e: any) {
        console.error("Test Failed:", e);
        process.exit(1);
    }
}

runTest();
