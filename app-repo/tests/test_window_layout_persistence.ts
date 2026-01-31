import { deserializeWindowLayout, filterLayoutByAvailableWindows, serializeWindowLayout } from "../../app-ui/src/lib/windowLayout.ts";

function assert(condition: boolean, message: string) {
    if (!condition) {
        console.error(`FAIL: ${message}`);
        process.exit(1);
    }
}

function runTest() {
    console.log("Running Window Layout Persistence Test...");

    const snapshot = {
        windows: {
            window_manager: { x: 10, y: 20, width: 300, height: 200, zOrder: 2 },
            help: { x: 30, y: 40, width: 320, height: 240, zOrder: 3 }
        },
        focusedWindowId: "help"
    };

    const layout = serializeWindowLayout(snapshot);
    assert(layout.openWindows.length === 2, "Expected two open windows");
    assert(layout.focusedWindowId === "help", "Expected focused window to be help");

    const raw = JSON.stringify(layout);
    const parsed = deserializeWindowLayout(raw);
    assert(!!parsed, "Expected parsed layout");
    assert(parsed!.openWindows.length === 2, "Expected parsed open windows count to be 2");
    assert(parsed!.focusedWindowId === "help", "Expected parsed focused window to be help");

    const filtered = filterLayoutByAvailableWindows(parsed!, new Set(["window_manager", "help"]));
    assert(filtered.openWindows.length === 2, "Expected filtered windows to keep both entries");
    assert(filtered.focusedWindowId === "help", "Expected focused window to remain help");

    const filteredUnknown = filterLayoutByAvailableWindows(parsed!, new Set(["window_manager"]));
    assert(filteredUnknown.openWindows.length === 1, "Expected unknown window to be filtered out");
    assert(filteredUnknown.focusedWindowId === null, "Expected focused window cleared when missing");

    const none = deserializeWindowLayout(null);
    assert(none === null, "Expected null layout when storage empty");

    console.log("SUCCESS: Window layout persistence roundtrip and reset behavior verified.");
    process.exit(0);
}

runTest();
