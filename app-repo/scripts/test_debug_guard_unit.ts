
import { canAccessDebug } from "../src/server/DebugGuard";
import { ModeGate } from "../src/server/ModeGate";

// Mock ModeGate
const originalCanUseDebug = ModeGate.canUseDebugEndpoints;

function runTests() {
  console.log("Running DebugGuard Unit Tests...");
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

  // Helper to create mock context
  function makeCtx(authHeader?: string, isLocal = true) {
    return {
      requestId: "test-req",
      remoteAddress: isLocal ? "127.0.0.1" : "1.2.3.4",
      req: {
        headers: authHeader ? { "x-dev-auth": authHeader } : {},
        socket: { remoteAddress: isLocal ? "127.0.0.1" : "1.2.3.4" }
      }
    } as any;
  }

  // --- Test 1: Flag Disabled ---
  // Force ModeGate to return false
  ModeGate.canUseDebugEndpoints = () => false;
  assert(canAccessDebug(makeCtx()) === false, "Should block if server flag is disabled");

  // --- Test 2: Flag Enabled, No Auth Header ---
  ModeGate.canUseDebugEndpoints = () => true;
  assert(canAccessDebug(makeCtx()) === false, "Should block if server flag on but no auth header");

  // --- Test 3: Flag Enabled, Invalid Auth Header ---
  ModeGate.canUseDebugEndpoints = () => true;
  assert(canAccessDebug(makeCtx("invalid-json")) === false, "Should block invalid JSON");

  // --- Test 4: Flag Enabled, Valid JSON but No Perms ---
  ModeGate.canUseDebugEndpoints = () => true;
  assert(canAccessDebug(makeCtx(JSON.stringify({ roles: ["USER"] }))) === false, "Should block if wrong role");

  // --- Test 5: Flag Enabled, Correct Permission ---
  ModeGate.canUseDebugEndpoints = () => true;
  assert(canAccessDebug(makeCtx(JSON.stringify({ permissions: ["sysadmin.dev"] }))) === true, "Should allow with sysadmin.dev permission");

  // --- Test 6: Flag Enabled, Correct Role ---
  ModeGate.canUseDebugEndpoints = () => true;
  assert(canAccessDebug(makeCtx(JSON.stringify({ roles: ["SYSADMIN"] }))) === true, "Should allow with SYSADMIN role");
 
  // Cleanup
  ModeGate.canUseDebugEndpoints = originalCanUseDebug;

  console.log(`\nSummary: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) process.exit(1);
}

runTests();
