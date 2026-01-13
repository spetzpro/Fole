import { withTestServer } from './_test_server_harness';
import { createClientRuntime } from '../src/core/ui/ClientRuntime';
import { createSessionRuntime } from '../src/core/ui/SessionRuntime';
import { buildActionIndex, ActionDescriptor } from '../src/core/ui/ActionIndex';
import http from 'http';
import * as url from 'url';

// Deployment helper
async function deployBundle(baseUrl: string, bundle: any) {
  return new Promise((resolve, reject) => {
    const u = url.parse(baseUrl + '/api/config/shell/deploy');
    const postData = JSON.stringify({ bundle, message: "ActionIndex Test", forceInvalid: false });
    const options = {
      hostname: u.hostname || '127.0.0.1',
      port: u.port,
      path: u.path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    };
    const req = http.request(options, (res) => {
        if (res.statusCode === 200) resolve(true);
        else reject(new Error(`Deploy status ${res.statusCode}`));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runTest() {
    try {
        await withTestServer({ devMode: false }, async ({ baseUrl }) => {
            console.log("Starting ActionIndex Test...");

            const bundle = {
                manifest: {
                    schemaVersion: "1.0.0",
                    regions: { top: { blockId: "head" }, main: { blockId: "view" }, bottom: { blockId: "foot" } }
                },
                blocks: {
                    "head": { schemaVersion: "1.0.0", blockId: "head", blockType: "shell.region.header", data: { title: "Test" } },
                    "view": { schemaVersion: "1.0.0", blockId: "view", blockType: "shell.rules.viewport", data: { allowZoom: true } },
                    "foot": { schemaVersion: "1.0.0", blockId: "foot", blockType: "shell.region.footer", data: { copyrightText: "Test" } },
                    "infra_routing": { schemaVersion: "1.0.0", blockId: "infra_routing", blockType: "shell.infra.routing", data: { routes: { "idx": { enabled:true, targetBlockId:"view", label:"Index", accessPolicy:{anonymous:true}} }, publishedLinks: {} } },
                    "infra_theme": { schemaVersion: "1.0.0", blockId: "infra_theme", blockType: "shell.infra.theme_tokens", data: { tokens: {} } },
                    "infra_windows": { schemaVersion: "1.0.0", blockId: "infra_windows", blockType: "shell.infra.window_registry", data: { windows: {} } },
                    "overlay_menu": { schemaVersion: "1.0.0", blockId: "overlay_menu", blockType: "shell.overlay.main_menu", data: { items: [] } },

                    // Button Block
                    "btn1": {
                        schemaVersion: "1.0.0",
                        blockId: "btn1",
                        blockType: "shell.control.button.standard",
                        data: {
                            label: "Do Thing",
                            interactions: {
                                "click": {
                                    kind: "command",
                                    params: { commandId: "my_action", args: [{ foo: "bar" }] },
                                    permissions: ["can_click"]
                                }
                            }
                        }
                    },
                     // Target Block
                    "TargetBlock": { 
                        schemaVersion: "1.0.0", 
                        blockId: "TargetBlock",
                        blockType: "generic.data", 
                        data: { state: { val: "init" } } 
                    },
                    // Binding responding to 'my_action' from 'btn1'
                    "Binding1": {
                        schemaVersion: "1.0.0",
                        blockId: "Binding1",
                        blockType: "binding",
                        data: {
                            mode: "triggered",
                            enabled: true,
                            endpoints: [
                                { endpointId: "dst", direction: "in", target: { blockId: "TargetBlock", path: "/state/val" } },
                                { endpointId: "src", direction: "out", target: { blockId: "btn1", path: "/" } }
                            ],
                            mapping: {
                                trigger: { sourceBlockId: "btn1", name: "my_action" }, // Matches 'commandId'
                                kind: "setLiteral",
                                to: "dst",
                                value: "clicked"
                            },
                        }
                    }
                }
            };

            // Deploy bundle so client can load it (even if we use local eval for prod, initialization loads bundle)
            // Note: createSessionRuntime calls client.loadActiveBundle().
            // If we use withTestServer with devMode=false, the server is running in prod mode?
            // Actually withTestServer param 'devMode' controls the SERVER's mode? No, likely controls CLIENT's mode in harness.
            // Let's check: withTestServer(options, callback). harness uses options.devMode to set client? No, harness spawns server.
            // Server mode is determined by process.env or args.
            // Actually, we can just use createClientRuntime({ baseUrl, devMode: false }).
            
            await deployBundle(baseUrl, bundle);

            const client = createClientRuntime({ baseUrl, devMode: false });
            const session = await createSessionRuntime(client, "idx");

            // Build Index
            const index = buildActionIndex(session.model);
            console.log("Index:", JSON.stringify(index, null, 2));

            if (index.length !== 1) throw new Error("Expected 1 action in index");
            
            const act = index[0];
            if (act.actionName !== "my_action") throw new Error("Incorrect actionName");
            if (act.sourceBlockId !== "btn1") throw new Error("Incorrect sourceBlockId");
            if (act.id !== "btn1:click") throw new Error("Incorrect id");
            
            // Dispatch via Session (Prod Local Mode)
            // Note: our binding requires NO permissions (accessPolicy missing in binding = allow).
            // But the BUTTON ACTION definition had permissions: ["can_click"].
            // The ActionIndex reflects the button definition.
            // However, SessionRuntime triggers bindings.
            // Does TriggeredEvaluator check the BUTTON's permissions?
            // NO. TriggeredEvaluator checks the BINDING's accessPolicy.
            // Who checks the BUTTON's permissions? 
            // The UI (shell) usually checks button permissions before rendering or clicking.
            // Or the dispatch logic *could* check them?
            // The spec says: "3. Permission Check: Does the user have all permissions listed in the descriptor? - No -> Deny"
            // This logic is usually "Action Resolution" in the Shell (client-side UI).
            // Here we are dispatching directly to the SessionRuntime (Logic Layer).
            // The Logic Layer (TriggeredBinding) has ITS OWN accessPolicy.
            // So if we dispatch `my_action` to session, session only checks TriggeredBinding accessPolicy.
            // We'll proceed with dispatching.
            
            const res = await session.dispatchAction({
                sourceBlockId: act.sourceBlockId,
                actionName: act.actionName,
                payload: act.payload
            });

            if (res.applied !== 1) {
                console.log("Result:", res);
                throw new Error("Dispatch failed to apply");
            }
            
            // Verify state
            const state = session.__debugGetRuntimeState();
            if (state["TargetBlock"].state.val !== "clicked") throw new Error("State not mutated");

            console.log("✅ ACTION INDEX TEST PASSED");
        });
    } catch (e: any) {
        console.error(e);
        process.exit(1);
    }
}

runTest();
