import { createWorkspacePersistence, WorkspaceSessionRecord, WorkspaceStorageAdapter } from '../src/core/ui/WorkspacePersistence';

function assert(condition: boolean, description: string) {
    if (condition) {
        console.log(`✅ PASS: ${description}`);
    } else {
        console.error(`❌ FAIL: ${description}`);
        throw new Error(`Assertion failed: ${description}`);
    }
}

async function runTest() {
    console.log("Starting WorkspacePersistence Unit Test...");

    try {
        // InMemory Adapter
        let store: WorkspaceSessionRecord[] = [];
        const adapter: WorkspaceStorageAdapter = {
            loadAll: async () => [...store], // Return copy
            saveAll: async (records) => { store = [...records]; }
        };

        const persistence = createWorkspacePersistence(adapter);
        const start = 10000;

        // 1. Create Session
        const s1 = await persistence.createSession("tab1", start);
        assert(s1.tabId === "tab1", "createSession: Tab ID matches");
        assert(s1.createdAt === start, "createSession: CreatedAt matches");
        assert(s1.windows.length === 0, "createSession: Windows empty");
        
        const list1 = await persistence.listSessions();
        assert(list1.length === 1, "listSessions: One session exists");

        // 2. Touch Session
        await persistence.touchSession("tab1", start + 500);
        const list2 = await persistence.listSessions();
        assert(list2[0].lastSeenAt === start + 500, "touchSession: updated lastSeenAt");
        assert(list2[0].createdAt === start, "touchSession: createdAt preserved");

        // 3. Save/Load Windows
        const mockWindows = [{ id: "win1" }, { id: "win2" }];
        await persistence.saveWindows("tab1", mockWindows, start + 1000);
        
        const loaded = await persistence.loadWindows("tab1");
        assert(loaded !== null, "loadWindows: returned data");
        assert(loaded!.length === 2, "loadWindows: count matches");
        assert(loaded![0].id === "win1", "loadWindows: content matches");
        
        const list3 = await persistence.listSessions();
        assert(list3[0].lastSeenAt === start + 1000, "saveWindows: updated lastSeenAt");

        // 4. Fail-closed on missing
        const missing = await persistence.loadWindows("tab99");
        assert(missing === null, "loadWindows: returns null for missing tab");
        
        await persistence.saveWindows("tab99", mockWindows);
        const missingList = await persistence.listSessions();
        assert(missingList.length === 1, "saveWindows: does not create session for missing tab");

        // 5. Fork Session
        // fork tab1 -> tab2
        const s2 = await persistence.forkSession("tab1", "tab2", start + 2000);
        assert(s2 !== null, "forkSession: returned record");
        assert(s2!.tabId === "tab2", "forkSession: new tabId");
        assert(s2!.windows.length === 2, "forkSession: windows cloned");
        assert(s2!.windows !== mockWindows, "forkSession: windows are deep copy (ref check check technically tricky with json parse/stringify but strict equal fails)");
        // Edit clone, check original
        s2!.windows[0].id = "mod";
        const orig = await persistence.loadWindows("tab1");
        assert(orig![0].id === "win1", "forkSession: modifications to clone do not affect original");

        const list4 = await persistence.listSessions();
        assert(list4.length === 2, "forkSession: total sessions 2");

        // 6. Prune Stale
        // tab1 lastSeen: start+1000
        // tab2 lastSeen: start+2000
        // Current Time: start + 5000
        // Threshold 3500 => anything older than start+1500 is stale
        // tab1 (1000) is < 1500 => Stale
        // tab2 (2000) is >= 1500 => Keep
        
        const pruned = await persistence.pruneStale(3500, start + 5000);
        assert(pruned === 1, `pruneStale: removed 1 session (got ${pruned})`);
        
        const list5 = await persistence.listSessions();
        assert(list5.length === 1, "pruneStale: 1 session remains");
        assert(list5[0].tabId === "tab2", "pruneStale: correct session remains");

        // 7. Deterministic Sort
        // Create tab3 later but use older time for lastSeen to check sort order
        await persistence.createSession("tab3", start + 6000); // lastSeen = 6000
        await persistence.createSession("tab4", start + 6000); // lastSeen = 6000
        // Update tab2 to be oldest (start+2000)
        
        // tab3: 6000
        // tab4: 6000
        // tab2: 2000
        
        const sorted = await persistence.listSessions();
        // timestamps: 6000, 6000, 2000
        // ties broken by tabId asc: tab3, tab4
        
        assert(sorted[0].tabId === "tab3", "Sort: Time desc, then ID asc (tab3)");
        assert(sorted[1].tabId === "tab4", "Sort: Time desc, then ID asc (tab4)");
        assert(sorted[2].tabId === "tab2", "Sort: Time desc (tab2 last)");

        console.log("\nSummary: All checks passed.");
        process.exit(0);

    } catch (e: any) {
        console.error("\nFATAL ERROR:", e.message);
        process.exit(1);
    }
}

runTest();
