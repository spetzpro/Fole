import { createClientRuntime, ClientRuntime } from '../src/core/ui/ClientRuntime';
import { createShellRuntime } from '../src/core/ui/ShellRuntime';
import { withTestServer } from './_test_server_harness';
import * as url from 'url';
import http from 'http';
import { WorkspaceStorageAdapter } from '../src/core/ui/WorkspacePersistence';

// Helper to deploy bundle
async function deployBundle(baseUrl: string, bundle: any) {
  return new Promise((resolve, reject) => {
    const u = url.parse(baseUrl + '/api/config/shell/deploy');
    const postData = JSON.stringify({
        bundle: bundle,
        message: "ShellRuntime Test Deploy",
        forceInvalid: false
    });
    
    const options = {
      hostname: u.hostname || '127.0.0.1',
      port: u.port,
      path: u.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
         if (res.statusCode === 200) resolve(JSON.parse(data));
         else reject(new Error(`Deploy failed: ${res.statusCode} ${data}`));
      });
    });
    
    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

function assert(condition: boolean, description: string) {
    if (condition) {
        console.log(` PASS: ${description}`);
    } else {
        console.error(` FAIL: ${description}`);
        throw new Error(`Assertion failed: ${description}`);
    }
}

const testBundle = {
    manifest: {
        schemaVersion: "1.0.0",
        title: "Shell Test Bundle",
        regions: {
            top: { blockId: "head" },
            main: { blockId: "view" },
            bottom: { blockId: "foot" }
        }
    },
    blocks: {
        "head": { schemaVersion: "1.0.0", blockId: "head", blockType: "shell.region.header", data: { title: "Test" } },
        "foot": { schemaVersion: "1.0.0", blockId: "foot", blockType: "shell.region.footer", data: { copyrightText: "Test" } },
        "view": { schemaVersion: "1.0.0", blockId: "view", blockType: "shell.rules.viewport", data: { allowZoom: true } },
        
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
        
        // Window Registry (Fixed schema compliance)
        "infra_windows": { 
            schemaVersion: "1.0.0", 
            blockId: "infra_windows", 
            blockType: "shell.infra.window_registry", 
            data: { 
                windows: {
                    "wina": { mode: "singleton" }
                } 
            } 
        },
        
        // Overlay
        "overlay_menu": { schemaVersion: "1.0.0", blockId: "overlay_menu", blockType: "shell.overlay.main_menu", data: { items: [] } },
        
        // Action Button
        "btn1": { 
            schemaVersion: "1.0.0",
            blockId: "btn1", 
            blockType: "shell.control.button.standard", 
            data: { 
                label: "ClickMe", 
                interactions: {
                    "click": {
                        kind: "command",
                        params: { commandId: "my_action" }
                    }
                } 
            } 
        },
        
        // Data Blocks for Triggering
        "SourceBlock": { schemaVersion: "1.0.0", blockId: "SourceBlock", blockType: "generic.data", data: { state: { val: 0 } } },
        "TargetBlock": { schemaVersion: "1.0.0", blockId: "TargetBlock", blockType: "generic.data", data: { state: { count: 0 } } },
        
        // Triggered Binding
        "Trigger1": {
            blockId: "Trigger1",
            blockType: "binding",
            schemaVersion: "1.0.0",
            data: {
                mode: "triggered",
                enabled: true,
                endpoints: [
                    { endpointId: "dummy", direction: "in", target: { blockId: "TargetBlock", path: "/state/dummy" } },
                    { endpointId: "dst", direction: "in", target: { blockId: "TargetBlock", path: "/state/count" } }
                ],
                mapping: {
                    trigger: {
                        sourceBlockId: "btn1",
                        name: "my_action"
                    },
                    kind: "setLiteral",
                    value: 1,
                    to: "dst"
                }
            }
        }
    }
};

async function runTest() {
    console.log("Starting ShellRuntime Headless E2E Test (Server-Side)...");

    await withTestServer({ devMode: true }, async ({ baseUrl }) => {
        
        console.log(`[TEST] Server running at ${baseUrl}, deploying bundle...`);
        try {
            await deployBundle(baseUrl, testBundle);
            console.log("[TEST] Bundle deployed.");
        } catch (e: any) {
            console.error("[TEST] Deploy failed:", e.message);
            process.exit(1);
        }

        // Create Client pointing to minimal dev server
        const client = createClientRuntime({
            baseUrl,
            devMode: true
        });

        // Setup InMemory Workspace Persistence
        let store: any[] = [];
        const workspaceAdapter: WorkspaceStorageAdapter = {
            loadAll: async () => [...store],
            saveAll: async (records) => { store = [...records]; }
        };

        // Create Shell
        console.log("[TEST] Creating ShellRuntime...");
        const shell = await createShellRuntime({
            client,
            entrySlug: "ping",
            tabId: "tab_test",
            viewport: { width: 800, height: 600 },
            workspaceAdapter
        });

        // 1. Assert Initial Plan
        const plan = shell.getPlan();
        assert(plan.entrySlug === "ping", "Plan entrySlug correct");
        assert(plan.targetBlockId === "view", "Plan targetBlockId correct");
        assert(Array.isArray(plan.actions), "Plan actions is array");
        assert(plan.actions.some(a => a.sourceBlockId === "btn1" && a.actionName === "my_action"), "Plan contains btn1 action");
        assert(Array.isArray(plan.windows), "Plan windows is array");
        assert(plan.windows.length === 0, "No windows initially");

        // 2. Toggle Overlay
        console.log("[TEST] Toggling overlay...");
        const tog = shell.toggleOverlay("overlay_menu");
        assert(tog.ok === true && tog.isOpen === true, "Overlay toggled open");
        
        const plan2 = shell.getPlan();
        const ov2 = plan2.overlays.find(o => o.overlayId === "overlay_menu");
        assert(ov2?.isOpen === true, "Plan reflects overlay open");

        // 3. Open Window
        console.log("[TEST] Opening window...");
        const win = shell.openWindow("wina");
        assert(win.ok === true, "Window open ok");
        
        const plan3 = shell.getPlan();
        assert(plan3.windows.length === 1, "Plan reflects 1 window");
        assert(plan3.windows[0].windowKey === "wina", "Correct window opened");

        // 4. Dispatch Action
        console.log("[TEST] Dispatching action...");
        const dispatchRes = await shell.dispatchAction({ 
            sourceBlockId: "btn1", 
            actionName: "my_action", 
            permissions: ["can_click"] 
        });
        
        // Server-side dispatch via devMode debug endpoint
        if (dispatchRes.ok === false) {
             console.error("Dispatch Error:", dispatchRes);
             throw new Error("Dispatch failed: " + dispatchRes.error);
        }
        
        console.log(`[TEST] Dispatch result: applied=${dispatchRes.applied}`);
        assert(dispatchRes.applied === 1, `Dispatch applied 1 operation (got ${dispatchRes.applied})`);

        // 5. Apply Derived Tick
        console.log("[TEST] Applying derived tick...");
        const tickRes = await shell.applyDerivedTick();
        assert(tickRes.ok === true, "Derived tick ok");

        console.log(" SHELL RUNTIME E2E PASSED");
        process.exit(0);
    });
}

runTest().catch(e => {
    console.error("UNKNOWN ERROR:", e);
    process.exit(1);
});
