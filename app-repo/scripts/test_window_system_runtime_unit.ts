import { createWindowSystemRuntime, CanonicalWindowState, WindowSystemPersistence } from '../src/core/ui/WindowSystemRuntime';

async function runTest() {
    console.log("Starting WindowSystemRuntime Unit Test...");

    try {
        const registryEnvelope = {
            blockId: "infra_windows",
            blockType: "shell.infra.window_registry",
            schemaVersion: "1.0.0",
            data: {
                windows: {
                    "winA": { windowKey: "winA", singleton: true, defaultSize: { width: 300, height: 200 } },
                    "winB": { windowKey: "winB", singleton: false, defaultSize: { width: 500, height: 400 }, minSize: { width: 200, height: 150 } }
                }
            }
        };

        const memStore = new Map<string, CanonicalWindowState[]>();
        const persistence: WindowSystemPersistence = {
            load: async (tabId) => memStore.get(tabId) || null,
            save: async (tabId, wins) => { memStore.set(tabId, wins); },
        };

        const runtime = createWindowSystemRuntime({
            tabId: "tab1",
            viewport: { width: 800, height: 600 },
            windowRegistryBlockEnvelope: registryEnvelope,
            persistence
        });

        // 1. Unknown Key
        const bad = runtime.openWindow("winC");
        if (bad.ok) throw new Error("Should fail unknown key");
        
        // 2. Singleton
        const r1 = runtime.openWindow("winA");
        if (!r1.ok) throw new Error(r1.error);
        const r2 = runtime.openWindow("winA");
        if (!r2.ok) throw new Error(r2.error);
        
        if (runtime.list().length !== 1) throw new Error("Singleton should maintain count 1");
        if (runtime.list()[0].instanceId !== "winA") throw new Error("Singleton ID mismatch");

        // 3. Multi-instance
        const r3 = runtime.openWindow("winB");
        if (!r3.ok) throw new Error(r3.error);
        const r4 = runtime.openWindow("winB");
        if (!r4.ok) throw new Error(r4.error);

        const list = runtime.list();
        if (list.length !== 3) throw new Error(`Expected 3 windows, got ${list.length}`);

        // 4. Focus / Z-Order
        // winB (r4) was last opened, should have highest Z.
        // Focus winA.
        runtime.focusWindow({ windowKey: "winA", instanceId: "winA" });
        const last = runtime.list()[2]; // sorted ascending
        if (last.windowKey !== "winA") throw new Error("Focus failed to move to top");

        // 5. Bounds Clamping
        // Resize winB first instance to 900x700 (greater than 800x600)
        // instanceId auto-generated? r3.state.instanceId
        const winB1 = r3.state;
        const res = runtime.resizeWindow({ windowKey: winB1.windowKey, instanceId: winB1.instanceId }, { width: 900, height: 700 });
        if (!res.ok) throw new Error("Resize failed");
        if (res.state.width !== 800) throw new Error("Width not clamped to viewport");
        if (res.state.height !== 600) throw new Error("Height not clamped to viewport");

        // 6. Persistence Roundtrip
        await runtime.saveToPersistence();
        
        const runtime2 = createWindowSystemRuntime({
            tabId: "tab1",
            viewport: { width: 800, height: 600 },
            windowRegistryBlockEnvelope: registryEnvelope,
            persistence
        });
        await runtime2.loadFromPersistence();
        
        if (runtime2.list().length !== 3) throw new Error("Persistence restore count mismatch");
        
        // 7. Persistence Fail-Closed
        const corruptedState = [
            ...memStore.get("tab1")!,
            { windowKey: "winImposter", instanceId: "x", x:0, y:0, width:100, height:100, zOrder:999, minimized:false } as CanonicalWindowState
        ];
        memStore.set("tab1", corruptedState);

        const runtime3 = createWindowSystemRuntime({
            tabId: "tab1",
            viewport: { width: 800, height: 600 },
            windowRegistryBlockEnvelope: registryEnvelope,
            persistence
        });
        await runtime3.loadFromPersistence();
        // Should ignore winImposter
        if (runtime3.list().length !== 3) throw new Error("Persistence failed to drop unknown key");

        console.log("PASS");
        process.exit(0);
    } catch (e: any) {
        console.error("FAIL:", e.message);
        process.exit(1);
    }
}

runTest();
