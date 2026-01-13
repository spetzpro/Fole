import { createWorkspacePersistence, WorkspaceStorageAdapter, WorkspacePersistence } from '../src/core/ui/WorkspacePersistence';
import { WindowWorkspaceBridge } from '../src/core/ui/WindowWorkspaceBridge';

function assert(condition: boolean, description: string) {
    if (condition) {
        console.log(`✅ PASS: ${description}`);
    } else {
        console.error(`❌ FAIL: ${description}`);
        throw new Error(`Assertion failed: ${description}`);
    }
}

async function runTest() {
    console.log("Starting WindowWorkspaceBridge Unit Test...");

    try {
        // Setup underlying workspace persistence
        let store: any[] = [];
        const adapter: WorkspaceStorageAdapter = {
            loadAll: async () => [...store],
            saveAll: async (records) => { store = [...records]; }
        };
        const workspace = createWorkspacePersistence(adapter);
        
        // Initialize a session
        await workspace.createSession("tab1");
        
        // Setup bridge
        const bridge = new WindowWorkspaceBridge(workspace);

        // 1. Bridge Save
        const mockWindows: any[] = [{ windowKey: "winA", instanceId: "A1" }];
        await bridge.save("tab1", mockWindows);
        
        // Verify via workspace directly
        const loadedDirect = await workspace.loadWindows("tab1");
        assert(loadedDirect !== null, "Bridge save persisted to workspace");
        assert(loadedDirect![0].windowKey === "winA", "Bridge save content correct");

        // 2. Bridge Load
        const loadedBridge = await bridge.load("tab1");
        assert(loadedBridge !== null, "Bridge load returned data");
        assert(loadedBridge![0].instanceId === "A1", "Bridge load content correct");

        // 3. Fail-closed check (inherits from workspace behavior)
        const missing = await bridge.load("tabBad");
        assert(missing === null, "Bridge load returns null for missing session");

        console.log("PASS");
        process.exit(0);

    } catch (e: any) {
        console.error("FAIL:", e.message);
        process.exit(1);
    }
}

runTest();
