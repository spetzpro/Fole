import { withTestServer } from './_test_server_harness';
import http from 'http';
import * as url from 'url';

function log(msg: string) {
  console.log(`[E2E] ${msg}`);
}

function error(msg: string) {
  console.error(`[E2E FAIL] ${msg}`);
}

async function makeRequest(baseUrl: string, path: string, body: any): Promise<{ statusCode: number, data: any }> {
  return new Promise((resolve, reject) => {
    const u = url.parse(baseUrl + path);
    const postData = JSON.stringify(body);
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
        try {
          const json = responseData ? JSON.parse(responseData) : {};
          resolve({ statusCode: res.statusCode || 0, data: json });
        } catch (e) {
          reject(new Error(`Failed to parse response: ${responseData}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
        req.destroy();
        reject(new Error("Request timeout"));
    });
    req.write(postData);
    req.end();
  });
}

async function runTest() {
  try {
    await withTestServer({ devMode: true }, async ({ baseUrl }) => {
      log(`Server is ready at ${baseUrl}. Preparing deployment...`);

      const bundle = {
        manifest: {
            schemaVersion: "1.0.0",
            // Minimal manifest with required empty regions
            regions: {
                top: { blockId: "head" },
                main: { blockId: "view" },
                bottom: { blockId: "foot" }
            }
        },
        blocks: {
            "head": { schemaVersion: "1.0.0", blockId: "head", blockType: "shell.region.header", data: { title: "Test" } },
            "view": { schemaVersion: "1.0.0", blockId: "view", blockType: "shell.rules.viewport", data: { allowZoom: true } },
            "foot": { schemaVersion: "1.0.0", blockId: "foot", blockType: "shell.region.footer", data: { copyrightText: "Test" } },
            // Infra Blocks
            "infra_routing": { schemaVersion: "1.0.0", blockId: "infra_routing", blockType: "shell.infra.routing", data: { routes: {}, publishedLinks: {} } },
            "infra_theme": { schemaVersion: "1.0.0", blockId: "infra_theme", blockType: "shell.infra.theme_tokens", data: { tokens: {} } },
            "infra_windows": { schemaVersion: "1.0.0", blockId: "infra_windows", blockType: "shell.infra.window_registry", data: { windows: {} } },
            "overlay_menu": { schemaVersion: "1.0.0", blockId: "overlay_menu", blockType: "shell.overlay.main_menu", data: { items: [] } },

            // Source of the trigger
            "X": { schemaVersion: "1.0.0", blockId: "X", blockType: "generic.data", data: {} },
            // Target
            "TargetBlock": { 
                schemaVersion: "1.0.0", 
                blockId: "TargetBlock",
                blockType: "generic.data", 
                data: { state: { triggered_val: "initial" } } 
            },
            // The Binding
            "TriggeredBinding": {
                schemaVersion: "1.0.0",
                blockId: "TriggeredBinding",
                blockType: "binding",
                data: {
                    mode: "triggered",
                    enabled: true,
                    endpoints: [
                        { 
                            endpointId: "dst", 
                            direction: "in", 
                            target: { blockId: "TargetBlock", path: "/state/triggered_val" } 
                        },
                        { 
                            // Dummy Source Endpoint to satisfy minItems: 2
                            endpointId: "src", 
                            direction: "out", 
                            target: { blockId: "X", path: "/data" } 
                        }
                    ],
                    mapping: {
                        trigger: { sourceBlockId: "X", name: "ping" },
                        kind: "setLiteral",
                        to: "dst",
                        value: "pong"
                    },
                    accessPolicy: { 
                        expr: { 
                            kind: "ref", 
                            refType: "permission", 
                            key: "can_ping" 
                        } 
                    }
                }
            }
        }
     };

     // 1. Deploy
     log("Step 1: Deploying Bundle (valid)...");
     const deployRes = await makeRequest(baseUrl, '/api/config/shell/deploy', {
         bundle: bundle,
         message: "E2E Test Deploy",
         forceInvalid: false // Valid bundle
     });

     if (deployRes.statusCode !== 200) {
         error(`Deploy failed with status ${deployRes.statusCode}`);
         console.log(JSON.stringify(deployRes.data, null, 2));
         throw new Error("Deploy failed");
     }
     log("Deploy success.");


    // 2. Dispatch
    log("Step 2: Dispatching 'ping' action...");
    const res1 = await makeRequest(baseUrl, '/api/debug/action/dispatch', {
       sourceBlockId: "X",
       actionName: "ping",
       payload: {},
       permissions: ["can_ping"],
       roles: []
    });

    if (res1.statusCode !== 200) {
       error(`Dispatch Failed: Expected status 200, got ${res1.statusCode}`);
       console.log(res1.data);
       throw new Error("Dispatch Failed");
    }

    log("Dispatch returned 200. Checking application...");
    if (res1.data.applied !== 1) {
        error(`Application Check Failed: Expected applied=1, got ${res1.data.applied}`);
        console.log("Logs:", res1.data.logs);
        throw new Error("Binding was not applied");
    }
    
    // Optional: Check log content
    if (res1.data.logs && res1.data.logs.length > 0) {
        // Just print them for verification
        // console.log("Binding Logs:", res1.data.logs);
    }

    log("PASS: Step 2 (Triggered Binding Applied)");

    // 3. Validation Check
    log("Step 3: Invalid Payload Check...");
    const res2 = await makeRequest(baseUrl, '/api/debug/action/dispatch', {
        sourceBlockId: "123",
        actionName: null
    });

    if (res2.statusCode !== 400) {
        error(`Validation Check Failed: Expected status 400, got ${res2.statusCode}`);
        throw new Error("Validation mismatch");
    }
    log("PASS: Step 3 (Validation Error)");

    log("All tests passed.");
    });
    
    process.exit(0);
  } catch (err: any) {
    error(err.message);
    process.exit(1);
  }
}

runTest();
