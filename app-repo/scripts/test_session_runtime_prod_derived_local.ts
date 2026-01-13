import { createSessionRuntime } from '../src/core/ui/SessionRuntime';

async function runTest() {
    console.log("--- Starting SessionRuntime Prod Derived Local Test ---");
    
    // 1. Mock Client
    const activeBundle = {
        manifest: {
            schemaVersion: "1.0.0",
            regions: { top: { blockId: "head" }, main: { blockId: "view" }, bottom: { blockId: "foot" } }
        },
        blocks: {
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
            
            "SourceBlock": { blockId: "SourceBlock", blockType: "generic.data", data: { state: { val: "A" } } },
            "TargetBlock": { blockId: "TargetBlock", blockType: "generic.data", data: { state: {} } },
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
            }
        }
    };

    const fakeClient: any = {
        config: { baseUrl: "http://fake", devMode: false },
        loadActiveBundle: async () => ({ bundle: activeBundle }),
        resolveRoute: async () => ({ allowed: true, status: 200, targetBlockId: "view" }),
        dispatchDebugAction: async () => { throw new Error("Should not be called in prod test"); },
        dispatchDebugDerivedTick: async () => { throw new Error("Should not be called in prod test"); }
    };

    // 2. Create Runtime
    const session = await createSessionRuntime(fakeClient, "ping");
    console.log("Session created.");

    // 3. Inspect Initial State
    const st = session.__debugGetRuntimeState();
    if (!st["SourceBlock"] || st["SourceBlock"].state.val !== "A") {
        throw new Error("Initial state for SourceBlock incorrect");
    }
    if (!st["TargetBlock"]) {
        throw new Error("TargetBlock missing in initial state");
    }

    // 4. Apply Derived Tick
    console.log("Applying local tick...");
    const tick = await session.applyDerivedTick();
    console.log("Tick result:", tick);

    if (!tick.ok) {
        throw new Error(`Tick failed: ${tick.error}`);
    }
    if (!tick.didWork) {
        throw new Error("Tick says didWork=false, expected true");
    }
    if (tick.result.applied !== 1) {
        throw new Error(`Expected applied=1, got ${tick.result.applied}`);
    }

    // 5. Verify Mutation
    const targetVal = st["TargetBlock"].state.derived_val;
    if (targetVal !== "A") {
        throw new Error(`Expected TargetBlock derived_val="A", got "${targetVal}"`);
    }

    console.log("✅ SESSION PROD LOCAL TICK PASSED");
}

runTest().catch(e => {
    console.error("❌ TEST FAILED:", e);
    process.exit(1);
});
