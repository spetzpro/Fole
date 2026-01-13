import { createWindowSystemRuntime, CanonicalWindowState, WindowSystemPersistence } from '../src/core/ui/WindowSystemRuntime';

function assert(condition: boolean, description: string) {
    if (condition) {
        console.log(`✅ PASS: ${description}`);
    } else {
        console.error(`❌ FAIL: ${description}`);
        throw new Error(`Assertion failed: ${description}`);
    }
}

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

        // A) openWindow unknown key => ok:false
        const bad = runtime.openWindow("winC");
        assert(bad.ok === false, "Unknown key 'winC' should fail to open");
        assert((bad as any).error !== undefined, "Error message should be present for unknown key");

        // B) singleton open twice => same instanceId, list length 1
        const r1 = runtime.openWindow("winA");
        assert(r1.ok, "Singleton winA should open");
        const r2 = runtime.openWindow("winA");
        assert(r2.ok, "Singleton winA call again should return ok");
        
        const listSingleton = runtime.list().filter(w => w.windowKey === "winA");
        assert(listSingleton.length === 1, "Singleton should have only 1 instance");
        if (r1.ok && r2.ok) {
            assert(r1.state.instanceId === r2.state.instanceId, "Singleton instanceIds should match");
            assert(r1.state.instanceId === "winA", "Singleton ID should match windowKey");
        }

        // C) non-singleton open twice => list length 2, different instanceIds
        const r3 = runtime.openWindow("winB");
        assert(r3.ok, "Multi-instance winB #1 should open");
        const r4 = runtime.openWindow("winB");
        assert(r4.ok, "Multi-instance winB #2 should open");

        const listAll = runtime.list();
        // Should have 1 winA and 2 winB
        assert(listAll.length === 3, "Total windows should be 3 (1 winA + 2 winB)");
        if (r3.ok && r4.ok) {
             assert(r3.state.instanceId !== r4.state.instanceId, "Multi-instance IDs should be unique");
        }

        // D) focusWindow makes that window highest zOrder
        // Currently winB (#2) is likely on top because it was opened last.
        // Let's verify winA is NOT on top, then focus it.
        // (Assuming z-order is ascending in list)
        
        runtime.focusWindow({ windowKey: "winA", instanceId: "winA" });
        const listSorted = runtime.list();
        const topWindow = listSorted[listSorted.length - 1];
        assert(topWindow.windowKey === "winA", "Focusing winA should bring it to top (last in list)");

        // E) resize clamps to viewport (800x600) when requested larger
        if (r3.ok) {
            const winB1 = r3.state;
            const res = runtime.resizeWindow({ windowKey: winB1.windowKey, instanceId: winB1.instanceId }, { width: 900, height: 700 });
            assert(res.ok, "Resize should succeed");
            if (res.ok) {
                assert(res.state.width === 800, `Width expected 800, got ${res.state.width}`);
                assert(res.state.height === 600, `Height expected 600, got ${res.state.height}`);
            }
        }

        // F) persistence roundtrip restores expected windows
        await runtime.saveToPersistence();
        assert(memStore.has("tab1"), "Persistence save called");
        
        const runtime2 = createWindowSystemRuntime({
            tabId: "tab1",
            viewport: { width: 800, height: 600 },
            windowRegistryBlockEnvelope: registryEnvelope,
            persistence
        });
        await runtime2.loadFromPersistence();
        const storedList = runtime2.list();
        assert(storedList.length === 3, `Restored 3 windows (got ${storedList.length})`);
        
        // G) persistence fail-closed drops unknown windowKey entry
        // Inject bad data
        const currentData = memStore.get("tab1")!;
        const corruptedData = [
            ...currentData,
            { windowKey: "winImposter", instanceId: "fake-1", x:0, y:0, width:100, height:100, zOrder:999, minimized:false } as CanonicalWindowState
        ];
        memStore.set("tab1", corruptedData);

        const runtime3 = createWindowSystemRuntime({
            tabId: "tab1",
            viewport: { width: 800, height: 600 },
            windowRegistryBlockEnvelope: registryEnvelope,
            persistence
        });
        await runtime3.loadFromPersistence();
        const cleanedList = runtime3.list();
        assert(cleanedList.length === 3, "Unknown window keys should be dropped on load");
        assert(!cleanedList.some(w => w.windowKey === "winImposter"), "winImposter should not exist");

        console.log("\nSummary: All checks passed.");
        process.exit(0);

    } catch (e: any) {
        console.error("\nFATAL ERROR:", e.message);
        process.exit(1);
    }
}

runTest();
