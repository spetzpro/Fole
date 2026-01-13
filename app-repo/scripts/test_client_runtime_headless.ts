import { spawn } from 'child_process';
import http from 'http';
import { platform } from 'os';
import { createClientRuntime } from '../src/core/ui/ClientRuntime';
import * as url from 'url';

const SERVER_PORT = 3013;
const SERVER_HOST = '127.0.0.1';
const STARTUP_TIMEOUT_MS = 15000;

function log(msg: string) {
  console.log(`[CLIENT-TEST] ${msg}`);
}

function error(msg: string) {
  console.error(`[CLIENT-TEST FAIL] ${msg}`);
}

// Low-level helper just for deployment setup (bypassing client runtime which lacks 'deploy')
async function deployBundle(bundle: any) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
        bundle: bundle,
        message: "Client Runtime Test Deploy",
        forceInvalid: false 
    });
    
    const options = {
      hostname: SERVER_HOST,
      port: SERVER_PORT,
      path: '/api/config/shell/deploy',
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

function killProcess(child: any) {
  log("Stopping server...");
  child.kill();
  if (platform() === 'win32') {
     setTimeout(() => {
        try {
            const pid = child.pid;
            if (pid) {
                const { execSync } = require('child_process');
                execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
            }
        } catch (e) {
            // Ignore
        }
     }, 2000);
  }
}

async function runTest() {
  log("Starting server process on port 3013...");
  
  const env = { 
      ...process.env, 
      PORT: String(SERVER_PORT),
      FOLE_DEV_ALLOW_MODE_OVERRIDES: "1",
      FOLE_DEV_FORCE_INVALID_CONFIG: "1"
  };

  const cmd = platform() === 'win32' ? 'npx.cmd' : 'npx';
  const args = ['ts-node', '--project', 'tsconfig.json', 'app-repo/src/server/serverMain.ts'];

  const serverProcess = spawn(cmd, args, {
    env,
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: platform() === 'win32'
  });

  let serverReady = false;
  let serverOutput = '';

  serverProcess.stdout.on('data', (data) => {
    const str = data.toString();
    serverOutput += str;
    if (str.includes(`Server listening on http://127.0.0.1:${SERVER_PORT}`)) {
      serverReady = true;
    }
  });

  serverProcess.stderr.on('data', (data) => {
      process.stderr.write(`[SERVER ERR] ${data}`);
  });

  // Wait for startup
  const start = Date.now();
  while (!serverReady) {
    if (Date.now() - start > STARTUP_TIMEOUT_MS) {
      error("Server startup timeout");
      console.log("Partial Output:\n" + serverOutput);
      killProcess(serverProcess);
      process.exit(1);
    }
    await new Promise(r => setTimeout(r, 100));
  }
  
  log("Server is ready.");

  try {
     // 1. Initial Setup: Deploy Bundle
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

     await deployBundle(bundle);
     log("Bundle deployed.");

     // 2. Init Runtime
     const runtime = createClientRuntime({
         baseUrl: `http://${SERVER_HOST}:${SERVER_PORT}`,
         devMode: true
     });

     // 3. Test loadActiveBundle
     log("Testing loadActiveBundle()...");
     const loaded = await runtime.loadActiveBundle();
     if (!loaded || !loaded.bundle || !loaded.bundle.blocks) {
         throw new Error("loadActiveBundle returned invalid structure");
     }
     log("loadActiveBundle passed.");

     // 4. Test resolveRoute
     log("Testing resolveRoute()...");
     const rr = await runtime.resolveRoute("ping");
     if (rr.allowed !== true || rr.status !== 200 || rr.targetBlockId !== "view") {
         console.log("Response:", rr);
         throw new Error("resolveRoute failed validation");
     }
     log("resolveRoute passed.");

     // 5. Test dispatchDebugAction
     log("Testing dispatchDebugAction()...");
     // First with devMode=true (configured above)
     const res = await runtime.dispatchDebugAction({
         sourceBlockId: "X",
         actionName: "ping",
         payload: {},
         permissions: ["can_ping"]
     });
     6
     if (res.error) {
         throw new Error(`Dispatch error: ${res.error}`);
     }
     // We expect applied=1 because we deployed the binding
     log(`Dispatch result: applied=${res.applied}, skipped=${res.skipped}`);
     if (res.applied !== 1) throw new Error(`Expected applied=1, got ${res.applied}`);
     

     // 5. Test devMode=false protection
     const runtimeProd = createClientRuntime({
        baseUrl: `http://${SERVER_HOST}:${SERVER_PORT}`,
        devMode: false
     });
     const res2 = await runtimeProd.dispatchDebugAction({
        sourceBlockId: "X",
        actionName: "ping"
     });
     if (res2.status !== 403) {
         throw new Error(`Expected 403 in prod mode, got ${res2.status}`);
     }
     log("Client-side DevMode check passed.");

     log("All tests passed.");
     killProcess(serverProcess);
     process.exit(0);

  } catch (err: any) {
    error(err.message);
    killProcess(serverProcess);
    process.exit(1);
  }
}

runTest();
