import http from 'http';
import { createClientRuntime } from '../src/core/ui/ClientRuntime';
import { createSessionRuntime } from '../src/core/ui/SessionRuntime';
import { withTestServer } from './_test_server_harness';
import * as url from 'url';

function log(msg: string) {
  console.log(`[DERIVED-TEST] ${msg}`);
}

function error(msg: string) {
  console.error(`[DERIVED-TEST FAIL] ${msg}`);
}

async function deployBundle(baseUrl: string, bundle: any) {
  return new Promise((resolve, reject) => {
    const u = url.parse(baseUrl + '/api/config/shell/deploy');
    const postData = JSON.stringify({
        bundle: bundle,
        message: "Derived Tick Test Deploy",
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
      },
      timeout: 2000
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
          if (res.statusCode === 200) resolve(true);
          else reject(new Error(`Deploy failed: ${responseData}`));
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runTest() {
    try {
        await withTestServer({ devMode: true }, async ({ baseUrl }) => {
            log(`Running test against ${baseUrl}`);

            const bundle = {
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
                   
                   // Core Logic Blocks
                   "SourceBlock": { 
                        schemaVersion: "1.0.0", 
                        blockId: "SourceBlock",
                        blockType: "generic.data", 
                        data: { state: { val: "initial" } } 
                    },
                   "TargetBlock": { 
                        schemaVersion: "1.0.0", 
                        blockId: "TargetBlock",
                        blockType: "generic.data", 
                        data: { state: { derived_val: "none" } } 
                    },

                   // Derived Binding: Source -> Target
                   "DerivedBinding": {
                       schemaVersion: "1.0.0",
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
                   },

                   // Triggered Binding to SET Source (to act as input)
                   // We need an event source for this. Re-using SourceBlock as the emitter for simplicity?
                   // No, let's use a dummy block because generic.data doesn't emit.
                   // WAIT: dispatchDebugAction allows sending action on ANY block.
                   // The BindingRuntime listens for {sourceBlockId, name}. 
                   // So we can send an action on 'SourceBlock' named 'setA' manually.
                   // But we need a binding to CATCH it and write to SourceBlock state.
                   "SetBinding": {
                        schemaVersion: "1.0.0",
                        blockId: "SetBinding",
                        blockType: "binding",
                        data: {
                            mode: "triggered",
                            enabled: true,
                            endpoints: [
                                { endpointId: "target", direction: "in", target: { blockId: "SourceBlock", path: "/state/val" } },
                                { endpointId: "dummy", direction: "out", target: { blockId: "SourceBlock", path: "/data/dummy" } }
                            ],
                            mapping: {
                                trigger: { sourceBlockId: "SourceBlock", name: "setA" },
                                kind: "setLiteral",
                                to: "target",
                                value: "A"
                            }
                        }
                   },
                   "SetBindingB": {
                        schemaVersion: "1.0.0",
                        blockId: "SetBindingB",
                        blockType: "binding",
                        data: {
                            mode: "triggered",
                            enabled: true,
                            endpoints: [
                                { endpointId: "target", direction: "in", target: { blockId: "SourceBlock", path: "/state/val" } },
                                { endpointId: "dummy", direction: "out", target: { blockId: "SourceBlock", path: "/data/dummy" } }
                            ],
                            mapping: {
                                trigger: { sourceBlockId: "SourceBlock", name: "setB" },
                                kind: "setLiteral",
                                to: "target",
                                value: "B"
                            }
                        }
                   }
               }
            };
            
            await deployBundle(baseUrl, bundle);
            log("Bundle deployed.");

            // 1. Create Session
            const client = createClientRuntime({ baseUrl, devMode: true });
            const session = await createSessionRuntime(client, "ping");
            log("Session created.");

            // 2. Trigger Change Source=A
            log("Dispatching SetBinding (A)...");
            const resA = await session.dispatchAction({
                sourceBlockId: "SourceBlock",
                actionName: "setA"
            });
            if (resA.applied !== 1) throw new Error("Failed to apply SetBinding A");

            // 3. Apply Derived Tick (Propagate A -> Target)
            log("Applying Derived Tick (1)...");
            const tick1 = await session.applyDerivedTick();
            
            if (!tick1.ok) throw new Error("Derived tick failed: " + (tick1 as any).error);
            if (!tick1.didWork) {
                 console.log("Tick Result:", tick1);
                 throw new Error("Derived tick 1 did not result in work (expected applied=1)");
            }
            if (!tick1.result || tick1.result.applied !== 1) {
                 console.log("Tick Result:", tick1);
                 throw new Error("Derived tick 1 applied count mismatch");
            }
            log("SUCCESS: Tick 1 applied change.");

            // 4. Trigger Change Source=B
            log("Dispatching SetBindingB (B)...");
            const resB = await session.dispatchAction({
                sourceBlockId: "SourceBlock",
                actionName: "setB"
            });
            if (resB.applied !== 1) throw new Error("Failed to apply SetBinding B");

            // 5. Apply Derived Tick (Propagate B -> Target)
            log("Applying Derived Tick (2)...");
            const tick2 = await session.applyDerivedTick();
            
            if (!tick2.ok || !tick2.didWork || tick2.result.applied !== 1) {
                console.log("Tick 2 Result:", tick2);
                throw new Error("Derived tick 2 failed to apply work");
            }
            log("SUCCESS: Tick 2 applied change.");

            // 6. Verify Prod Mode is No-Op
            log("Verifying Prod Mode Safety...");
            const clientProd = createClientRuntime({ baseUrl, devMode: false });
            const sessionProd = await createSessionRuntime(clientProd, "ping"); // can still load public route
            
            const tickProd = await sessionProd.applyDerivedTick();
            if (tickProd.ok !== true || tickProd.didWork !== false || (tickProd as any).reason !== "not-implemented") {
                throw new Error("Prod mode should return not-implemented stub");
            }
            log("SUCCESS: Prod mode safe.");

            log("ALL TESTS PASSED");
        });
        
        process.exit(0);
    } catch (e: any) {
        error(e.message);
        process.exit(1);
    }
}

runTest();
