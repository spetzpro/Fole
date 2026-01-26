
import { ModeGate } from "../src/server/ModeGate";

// Helper to mock env
function withEnv(env: Record<string, string>, callback: () => void) {
  const originalEnv = { ...process.env };
  Object.assign(process.env, env);
  try {
    callback();
  } finally {
    process.env = originalEnv;
  }
}

function runTests() {
  console.log("Running ModeGate Unit Tests...");
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`[PASS] ${msg}`);
      passed++;
    } else {
      console.error(`[FAIL] ${msg}`);
      failed++;
    }
  }

  const LOCAL_CTX = { remoteAddress: "127.0.0.1", req: {} } as any;
  const REMOTE_CTX = { remoteAddress: "1.2.3.4", req: {} } as any;

  // Test 1: Debug Endpoints - Disabled by default
  withEnv({}, () => {
      assert(ModeGate.canUseDebugEndpoints(LOCAL_CTX) === false, "Default env should block debug");
  });

  // Test 2: Debug Endpoints - Enabled correctly
  withEnv({ FOLE_DEV_ALLOW_MODE_OVERRIDES: "1", FOLE_DEV_ENABLE_DEBUG_ENDPOINTS: "1" }, () => {
      assert(ModeGate.canUseDebugEndpoints(LOCAL_CTX) === true, "Should allow debug on localhost with flags");
  });

  // Test 3: Debug Endpoints - Blocked on remote
  withEnv({ FOLE_DEV_ALLOW_MODE_OVERRIDES: "1", FOLE_DEV_ENABLE_DEBUG_ENDPOINTS: "1" }, () => {
      assert(ModeGate.canUseDebugEndpoints(REMOTE_CTX) === false, "Should block debug on remote even with flags");
  });

  // Test 4: Dev Mode (Override) - Logic check
  withEnv({ FOLE_DEV_ALLOW_MODE_OVERRIDES: "1", FOLE_DEV_FORCE_INVALID_CONFIG: "1" }, () => {
      assert(ModeGate.canUseDeveloperMode(LOCAL_CTX) === true, "Should allow dev mode on localhost with flags");
  });

  // Test 5: Dev Mode - Blocked if force invalid missing
  withEnv({ FOLE_DEV_ALLOW_MODE_OVERRIDES: "1" }, () => {
      assert(ModeGate.canUseDeveloperMode(LOCAL_CTX) === false, "Should block dev mode if force invalid missing");
  });

  console.log(`\nSummary: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) process.exit(1);
}

runTests();
