import http from 'http';
import { createClientRuntime } from '../src/core/ui/ClientRuntime';
import { assembleTemplateSession } from '../src/core/ui/TemplateRuntime';
import { withTestServer } from './_test_server_harness';
import * as url from 'url';

function log(msg: string) {
  console.log(`[TEMPLATE-TEST] ${msg}`);
}

function error(msg: string) {
  console.error(`[TEMPLATE-TEST FAIL] ${msg}`);
}

// Helper needs to know where to deploy
async function deployBundle(baseUrl: string, bundle: any) {
  return new Promise((resolve, reject) => {
    const u = url.parse(baseUrl + '/api/config/shell/deploy');
    const postData = JSON.stringify({
        bundle: bundle,
        message: "Template Runtime Test Deploy",
        forceInvalid: false 
    });
    
    // Convert hostname to string just in case it's null (though u.hostname from 'url' usually is string or null)
    // http.request expects hostname?: string.
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
                   
                   // ADDED: Binding Block
                   "MyBinding": {
                       schemaVersion: "1.0.0",
                       blockId: "MyBinding",
                       blockType: "binding",
                       data: {
                           mode: "triggered",
                           enabled: true,
                           endpoints: [
                               { endpointId: "src", direction: "out", target: { blockId: "head", path: "/data/title" } },
                               { endpointId: "dst", direction: "in", target: { blockId: "foot", path: "/data/copyrightText" } }
                           ],
                           mapping: {
                               trigger: { sourceBlockId: "head", name: "ping" },
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

            // 2. Headless Client Setup
            const client = createClientRuntime({ baseUrl, devMode: true });

            // 3. Load Active Bundle
            log("Loading active bundle...");
            const loadedBundle = await client.loadActiveBundle();
            if (!loadedBundle || !loadedBundle.bundle) {
                throw new Error("Failed to load active bundle");
            }

            // 4. Resolve Route "ping"
            log("Resolving route 'ping'...");
            const resolveResponse = await client.resolveRoute("ping");
            if (!resolveResponse || resolveResponse.status !== 200) {
                throw new Error("Failed to resolve route 'ping'");
            }

            // 5. Assemble Template Session (Positive Case)
            log("Assembling Template Session (Positive Case)...");
            const result = assembleTemplateSession(loadedBundle, "ping", resolveResponse);
            
             if (result.ok === true) {
                 if (result.model.targetBlockId === "view") {
                     log("SUCCESS: targetBlockId is correct");
                 } else {
                     throw new Error(`Expected targetBlockId 'view', got '${result.model.targetBlockId}'`);
                 }
        
                 if (result.model.entrySlug === "ping") {
                     log("SUCCESS: entrySlug is correct");
                 } else {
                     throw new Error("Incorrect entry slug");
                 }
                 
                 if (result.model.targetBlock.blockId === "view") {
                     log("SUCCESS: targetBlock envelope present");
                 } else {
                     throw new Error("Target block envelope missing or invalid");
                 }

                 // Check bindings
                 if (Array.isArray(result.model.bindings)) {
                     log(`SUCCESS: Bindings array present (length=${result.model.bindings.length})`);
                     if (result.model.bindings.length !== 1) {
                         throw new Error(`Expected 1 binding, got ${result.model.bindings.length}`);
                     }
                     if (result.model.bindings[0].blockId === "MyBinding") {
                        log("SUCCESS: Binding blockId match");
                     } else {
                        throw new Error(`Expected binding blockId 'MyBinding', got ${result.model.bindings[0].blockId}`);
                     }
                 } else {
                     throw new Error("Bindings array missing from model");
                 }
        
             } else {
                 throw new Error(`Assemble failed unexpectedly: ${result.error}`);
             }

             // 6. Negative Case
            log("Testing Negative Case (Route Not Allowed)...");
            const badResolveResponse = { ...resolveResponse, allowed: false, status: 403 };
            const badResult = assembleTemplateSession(loadedBundle, "ping", badResolveResponse);
            
            if (badResult.ok === false) {
                log(`SUCCESS: Got expected failure for forbidden route: ${badResult.error}`);
            } else {
                throw new Error("Expected failure for forbidden route, but got success");
            }

            log("ALL TESTS PASSED");
        });
        
        // EXIT 0 ON SUCCESS
        process.exit(0);

    } catch (e: any) {
        error(e.message);
        process.exit(1);
    }
}

runTest();
