import http from 'http';
import { createClientRuntime } from '../src/core/ui/ClientRuntime';
import { createSessionRuntime } from '../src/core/ui/SessionRuntime';
import { withTestServer } from './_test_server_harness';
import * as url from 'url';

function log(msg: string) {
  console.log(`[SESSION-TEST] ${msg}`);
}

function error(msg: string) {
  console.error(`[SESSION-TEST FAIL] ${msg}`);
}

// Helper needs to know where to deploy
async function deployBundle(baseUrl: string, bundle: any) {
  return new Promise((resolve, reject) => {
    const u = url.parse(baseUrl + '/api/config/shell/deploy');
    const postData = JSON.stringify({
        bundle: bundle,
        message: "Session Runtime Test Deploy",
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

            // 1. Initial Setup
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
                   "X": { schemaVersion: "1.0.0", blockId: "X", blockType: "generic.data", data: {} },
                   "TargetBlock": { 
                        schemaVersion: "1.0.0", 
                        blockId: "TargetBlock",
                        blockType: "generic.data", 
                        data: { state: { triggered_val: "initial" } } 
                    },
                   // Triggered Binding
                   "TriggeredBinding": {
                       schemaVersion: "1.0.0",
                       blockId: "TriggeredBinding",
                       blockType: "binding",
                       data: {
                           mode: "triggered",
                           enabled: true,
                           endpoints: [
                               { endpointId: "dst", direction: "in", target: { blockId: "TargetBlock", path: "/state/triggered_val" } },
                               { endpointId: "src", direction: "out", target: { blockId: "X", path: "/data" } }
                           ],
                           mapping: {
                               trigger: { sourceBlockId: "X", name: "ping" },
                               kind: "setLiteral",
                               to: "dst",
                               value: "pong"
                           },
                           accessPolicy: { 
                               expr: { kind: "ref", refType: "permission", key: "can_ping" } 
                           }
                       }
                   }
               }
            };
            
            await deployBundle(baseUrl, bundle);
            log("Bundle deployed.");

            // 2. Headless Client Setup (Dev Mode)
            const client = createClientRuntime({ baseUrl, devMode: true });

            // 3. Create Session Runtime
            log("Creating Session Runtime...");
            const session = await createSessionRuntime(client, "ping");
            
            if (session.entrySlug !== "ping") throw new Error("Incorrect entry slug in session");
            if (session.model.routeResolution.targetBlockId !== "view") throw new Error("Incorrect targetBlockId in session model");

            log("Session Runtime created.");

            // 3b. Test Derived Tick (Stub)
            const tick = await session.applyDerivedTick();
            // In dev mode, this now hits the server. The server might say "skipped" or "applied:0"
            // So we just check basic structure.
            if (tick.ok !== true) {
                throw new Error("applyDerivedTick failed");
            }
            log("applyDerivedTick verified (dev mode).");

            // 4. Dispatch Action (Positive)
            log("Dispatching action via session...");
            const res = await session.dispatchAction({
                sourceBlockId: "X",
                actionName: "ping",
                permissions: ["can_ping"]
            });

            if (res.applied === 1) {
                log("SUCCESS: Action dispatched and applied");
            } else {
                console.log("Response:", res);
                throw new Error("Action dispatch failed to apply");
            }

            // 5. DevMode=false Protection Test
            log("Testing ClientRuntime devMode=false protection via session...");
            const clientProd = createClientRuntime({ baseUrl, devMode: false });
            
            // Re-create session with prod client
            const sessionProd = await createSessionRuntime(clientProd, "ping");

            // Test derived tick in prod
            const tick2 = await sessionProd.applyDerivedTick();
            // In prod mode, local evaluator runs. Since this bundle has no derived bindings, didWork should be false.
            if (tick2.ok !== true || tick2.didWork !== false) {
                console.log("Prod tick result:", tick2);
                throw new Error("applyDerivedTick failed checks in prod (expected ok=true, didWork=false)");
            }
            
            // Should return local evaluation result (not 403) because Prod SessionRuntime now evaluates locally
            const resProd = await sessionProd.dispatchAction({
                sourceBlockId: "X",
                actionName: "ping"
            });
            
            // In this test case (prod mode call), we didn't pass permissions, 
            // so the accessPolicy 'can_ping' should fail => skipped.
            if (resProd && resProd.applied === 0 && resProd.skipped >= 1 && Array.isArray(resProd.logs)) {
                log("SUCCESS: Local evaluation executed in prod mode (access denied as expected)");
            } else {
                console.log("Unexpected response in prod dispatch:", resProd);
                throw new Error("Expected local evaluation result (applied=0, skipped>=1) for dispatch in prod mode");
            }
            
            log("ALL TESTS PASSED");
        });
        
        process.exit(0);

    } catch (e: any) {
        error(e.message);
        process.exit(1);
    }
}

runTest();
