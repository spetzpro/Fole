import { createOverlayRuntime, OverlayRuntime } from '../src/core/ui/OverlayRuntime';

function assert(condition: boolean, description: string) {
    if (condition) {
        console.log(`✅ PASS: ${description}`);
    } else {
        console.error(`❌ FAIL: ${description}`);
        throw new Error(`Assertion failed: ${description}`);
    }
}

async function runTest() {
    console.log("Starting OverlayRuntime Unit Test...");

    try {
        const mockOverlays = [
            { blockId:"overlay_menu", blockType:"shell.overlay.main_menu", schemaVersion:"1.0.0", data:{} },
            { blockId:"overlay_ctx", blockType:"shell.overlay.context_menu", schemaVersion:"1.0.0", data:{} }
        ];

        const runtime = createOverlayRuntime({ overlays: mockOverlays });

        // 1. Open unknown => ok:false
        const res1 = runtime.open("bad_overlay");
        assert(res1.ok === false, "Unknown overlay should fail");

        // 2. Open overlay_menu => isOpen true
        const res2 = runtime.open("overlay_menu");
        assert(res2.ok === true, "Open menu should succeed");
        assert(runtime.isOpen("overlay_menu") === true, "Menu should be reported open");
        
        const list1 = runtime.list().filter(o => o.isOpen);
        assert(list1.length === 1, "List should show 1 open overlay");
        assert(list1[0].overlayId === "overlay_menu", "Open overlay is menu");

        // 3. Open overlay_ctx => both open, ctx has higher z
        const res3 = runtime.open("overlay_ctx");
        assert(res3.ok === true, "Open ctx should succeed");
        
        const list2 = runtime.list().filter(o => o.isOpen); // list() returns sorted asc by zOrder
        assert(list2.length === 2, "Both overlays open");
        const menuState = list2.find(s => s.overlayId === "overlay_menu");
        const ctxState = list2.find(s => s.overlayId === "overlay_ctx");
        
        assert(menuState !== undefined && ctxState !== undefined, "Both states found");
        if (menuState && ctxState) {
            assert(ctxState.zOrder > menuState.zOrder, "Context menu (opened later) should have higher Z");
        }

        // 4. DismissTop("escape") => closes ctx, menu still open
        const dismissRes = runtime.dismissTop("escape");
        assert(dismissRes.ok === true, "Dismiss top ok");
        if (dismissRes.ok) {
            assert(dismissRes.dismissed === "overlay_ctx", "Dismissed top element (ctx)");
        }
        
        assert(runtime.isOpen("overlay_ctx") === false, "Ctx closed");
        assert(runtime.isOpen("overlay_menu") === true, "Menu still open");

        // 5. Toggle menu => closes it (since it's open)
        const toggleRes = runtime.toggle("overlay_menu");
        assert(toggleRes.ok === true, "Toggle ok");
        // TS narrowing needed or cast
        if (toggleRes.ok) {
             assert(toggleRes.isOpen === false, "Toggle returned closed state");
        }
        assert(runtime.isOpen("overlay_menu") === false, "Menu actually closed");

        // 6. DismissTop when none => ok true dismissed undefined
        const dismissEmpty = runtime.dismissTop("escape");
        assert(dismissEmpty.ok === true, "Dismiss empty ok");
        if (dismissEmpty.ok) {
            assert(dismissEmpty.dismissed === undefined, "Dismissed nothing");
        }


        console.log("PASS");
        process.exit(0);

    } catch (e: any) {
        console.error("FAIL:", e.message);
        process.exit(1);
    }
}

runTest();
