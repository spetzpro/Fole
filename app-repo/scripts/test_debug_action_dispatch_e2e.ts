import { spawn } from 'child_process';
import http from 'http';
import { platform } from 'os';

const SERVER_PORT = 3011;
const SERVER_HOST = '127.0.0.1';
const STARTUP_TIMEOUT_MS = 10000;

function log(msg: string) {
  console.log(`[E2E] ${msg}`);
}

function error(msg: string) {
  console.error(`[E2E FAIL] ${msg}`);
}

async function makeRequest(path: string, body: any): Promise<{ statusCode: number, data: any }> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const options = {
      hostname: SERVER_HOST,
      port: SERVER_PORT,
      path: path,
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

function killProcess(child: any) {
  log("Stopping server...");
  child.kill();
  
  // Give it a moment, then force kill on Windows if needed
  if (platform() === 'win32') {
     setTimeout(() => {
        try {
            // Using taskkill to ensure the tree (including ts-node -> node) is dead
            const pid = child.pid;
            if (pid) {
                const { execSync } = require('child_process');
                execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
            }
        } catch (e) {
            // Ignore if already dead
        }
     }, 2000);
  }
}

async function runTest() {
  log("Starting server process...");
  
  const env = { 
      ...process.env, 
      PORT: String(SERVER_PORT),
      FOLE_DEV_ALLOW_MODE_OVERRIDES: "1",
      FOLE_DEV_FORCE_INVALID_CONFIG: "1"
  };

  // On Windows, npx is a cmd file.
  const cmd = platform() === 'win32' ? 'npx.cmd' : 'npx';
  const args = ['ts-node', '--project', 'tsconfig.json', 'app-repo/src/server/serverMain.ts'];

  const serverProcess = spawn(cmd, args, {
    env,
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: platform() === 'win32' // Fix EINVAL on Windows by enabling shellMode for cmd files
  });

  let serverReady = false;
  let serverOutput = '';

  serverProcess.stdout.on('data', (data) => {
    const str = data.toString();
    serverOutput += str;
    // process.stdout.write(`[SERVER] ${str}`); // Start quiet, verify strictly
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
  
  log("Server is ready. Running tests...");

  try {
    // TEST 1: Valid Dispatch (Success Case)
    log("Test 1: Valid Dispatch Payload...");
    const res1 = await makeRequest('/api/debug/action/dispatch', {
       sourceBlockId: "X",
       actionName: "ping",
       payload: {},
       permissions: ["can_ping"],
       roles: []
    });

    if (res1.statusCode !== 200) {
       error(`Test 1 Failed: Expected status 200, got ${res1.statusCode}`);
       console.log(res1.data);
       throw new Error("Test 1 Failed");
    }

    if (typeof res1.data.applied !== 'number' || typeof res1.data.skipped !== 'number' || !Array.isArray(res1.data.logs)) {
        error(`Test 1 Failed: Response shape invalid`);
        console.log(res1.data);
        throw new Error("Test 1 Failed");
    }
    log("PASS: Test 1 (Valid Dispatch)");

    // TEST 2: Invalid Payload (Validation Case)
    log("Test 2: Invalid Payload (Missing actionName)...");
    const res2 = await makeRequest('/api/debug/action/dispatch', {
        sourceBlockId: "123",
        actionName: null // Invalid
    });

    if (res2.statusCode !== 400) {
        error(`Test 2 Failed: Expected status 400, got ${res2.statusCode}`);
        console.log(res2.data);
        throw new Error("Test 2 Failed");
    }
    log("PASS: Test 2 (Validation Error)");

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
