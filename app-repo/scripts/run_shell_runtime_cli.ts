import { createClientRuntime } from '../src/core/ui/ClientRuntime';
import { createShellRuntime } from '../src/core/ui/ShellRuntime';
import { withTestServer } from './_test_server_harness';
import http from 'http';
import * as url from 'url';
import { WorkspaceStorageAdapter } from '../src/core/ui/WorkspacePersistence';

// Helper to deploy bundle
async function deployBundle(baseUrl: string, bundle: any) {
  return new Promise((resolve, reject) => {
    const u = url.parse(baseUrl + '/api/config/shell/deploy');
    const postData = JSON.stringify({
        bundle: bundle,
        message: "ShellRuntime CLI Deploy",
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

const cliBundle = {
    manifest: {
        schemaVersion: "1.0.0",
        title: "Shell CLI Bundle",
        regions: {
            top: { blockId: "head" },
            main: { blockId: "view" },
            bottom: { blockId: "foot" }
        }
    },
    blocks: {
        "head": { schemaVersion: "1.0.0", blockId: "head", blockType: "shell.region.header", data: { title: "CLI Header" } },
        "foot": { schemaVersion: "1.0.0", blockId: "foot", blockType: "shell.region.footer", data: { copyrightText: "CLI Footer" } },
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
        
        "overlay_menu": { schemaVersion: "1.0.0", blockId: "overlay_menu", blockType: "shell.overlay.main_menu", data: { items: [] } },
        
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

        "SourceBlock": { schemaVersion: "1.0.0", blockId: "SourceBlock", blockType: "generic.data", data: { state: { val: 0 } } },
        "TargetBlock": { schemaVersion: "1.0.0", blockId: "TargetBlock", blockType: "generic.data", data: { state: { count: 0 } } },
        
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

async function runCLI() {
    console.log("------------------------------------------");
    console.log("  SHELL RUNTIME HEADLESS CLI RUNNER");
    console.log("------------------------------------------");

    await withTestServer({ devMode: true }, async ({ baseUrl }) => {
        try {
            console.log(`> Deploying CLI Bundle to ${baseUrl}...`);
            await deployBundle(baseUrl, cliBundle);
            console.log("> Bundle Deployed.\n");

            const client = createClientRuntime({
                baseUrl,
                devMode: true
            });

            // In-Memory Workspace Adapter
            let store: any[] = [];
            const workspaceAdapter: WorkspaceStorageAdapter = {
                loadAll: async () => [...store],
                saveAll: async (records) => { store = [...records]; }
            };

            const shell = await createShellRuntime({
                client,
                entrySlug: "ping",
                tabId: "tab_cli",
                viewport: { width: 800, height: 600 },
                workspaceAdapter
            });

            const printPlan = (label: string) => {
                const p = shell.getPlan();
                const view = {
                    entrySlug: p.entrySlug,
                    targetBlockId: p.targetBlockId,
                    actions: p.actions.length,
                    actionIds: p.actions.map(a => a.sourceBlockId + ':' + a.actionName),
                    windows: {
                        count: p.windows.length,
                        keys: p.windows.map(w => w.windowKey)
                    },
                    overlays: p.overlays.map(o => `${o.overlayId}:${o.isOpen ? 'OPEN' : 'CLOSED'}`)
                };
                console.log(`\n[PLAN STATE: ${label}]`);
                console.log(JSON.stringify(view, null, 2));
            };

            printPlan("INITIAL");

            // A) Toggle Overlay
            console.log("\n> Executing: toggleOverlay('overlay_menu')");
            shell.toggleOverlay("overlay_menu");
            printPlan("AFTER A");

            // B) Open Window
            console.log("\n> Executing: openWindow('wina')");
            shell.openWindow("wina");
            printPlan("AFTER B");

            // C) Dispatch Action
            console.log("\n> Executing: dispatchAction(btn1, my_action)");
            const actionRes = await shell.dispatchAction({ 
                sourceBlockId: "btn1", 
                actionName: "my_action",
                permissions: ["can_click"] 
            });
            console.log("  Result:", JSON.stringify(actionRes));
            printPlan("AFTER C");

            // D) Apply Derived Tick
            console.log("\n> Executing: applyDerivedTick()");
            const tickRes = await shell.applyDerivedTick();
            console.log("  Result:", JSON.stringify(tickRes));
            printPlan("AFTER D");

            console.log("\n✅ SHELL CLI RUN COMPLETE");
            process.exit(0);

        } catch (e: any) {
            console.error("\n❌ FATAL ERROR:", e.message);
            console.error(e);
            process.exit(1);
        }
    });
}

runCLI();
