
import { ModeGate } from "../src/server/ModeGate";
import { canAccessDebug } from "../src/server/DebugGuard";

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

// Mock Request Context
function mockCtx(remoteAddress: string, headers: Record<string, string> = {}) {
    return {
        remoteAddress,
        req: {
            headers
        }
    } as any;
}

function runTests() {
  console.log("Running DebugGuard & Capabilities Logic Tests...");
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

  const LOCALHOST = "127.0.0.1";
  const REMOTE = "10.0.0.1";

  // --- 1. DebugGuard Tests ---
  console.log("\nTesting DebugGuard.canAccessDebug(ctx)...");

  // A. Env Flags Disabled (Default)
  withEnv({}, () => {
      const ctx = mockCtx(LOCALHOST, { "x-dev-auth": JSON.stringify({ permissions: ["sysadmin.dev"] }) });
      assert(canAccessDebug(ctx) === false, "Guard: Should Deny when Env Flags are OFF");
  });

  // B. Env Flags Enabled (Note: Debug enabled ONLY, overrides NOT required for DebugGuard anymore)
  withEnv({ FOLE_DEV_ENABLE_DEBUG_ENDPOINTS: "1" }, () => {
      
      // 1. Missing Header
      {
          const ctx = mockCtx(LOCALHOST, {});
          assert(canAccessDebug(ctx) === false, "Guard: Should Deny when Header Missing");
      }

      // 2. Invalid Header JSON
      {
          const ctx = mockCtx(LOCALHOST, { "x-dev-auth": "{ bad json " });
          assert(canAccessDebug(ctx) === false, "Guard: Should Deny when Header Invalid JSON");
      }

      // 3. Header present but no permission
      {
          const ctx = mockCtx(LOCALHOST, { "x-dev-auth": JSON.stringify({ permissions: ["user.read"] }) });
          assert(canAccessDebug(ctx) === false, "Guard: Should Deny when Permission Missing");
      }

      // 4. Header present with Permission
      {
          const ctx = mockCtx(LOCALHOST, { "x-dev-auth": JSON.stringify({ permissions: ["sysadmin.dev"] }) });
          assert(canAccessDebug(ctx) === true, "Guard: Should ALLOW with Permission 'sysadmin.dev'");
      }

      // 5. Header present with Role
      {
          const ctx = mockCtx(LOCALHOST, { "x-dev-auth": JSON.stringify({ roles: ["SYSADMIN"] }) });
          assert(canAccessDebug(ctx) === true, "Guard: Should ALLOW with Role 'SYSADMIN'");
      }

      // 6. Remote Address (Even with valid header/flags)
      {
          const ctx = mockCtx(REMOTE, { "x-dev-auth": JSON.stringify({ permissions: ["sysadmin.dev"] }) });
          assert(canAccessDebug(ctx) === false, "Guard: Should Deny Remote Address");
      }
  });


  // --- 2. Capabilities Endpoint Logic Tests ---
  console.log("\nTesting /api/runtime/capabilities Logic...");
  
  // Logic from validation:
  // const debugEnabled = ModeGate.debugEndpointsEnabled(ctx);
  // const overridesEnabled = ModeGate.canUseDevAuthBypass(ctx);

  // A. Default State
  withEnv({}, () => {
      const ctx = mockCtx(LOCALHOST);
      const output = {
          debugEndpointsEnabled: ModeGate.debugEndpointsEnabled(ctx),
          devModeOverridesEnabled: ModeGate.canUseDevAuthBypass(ctx)
      };
      
      assert(output.debugEndpointsEnabled === false, "Capabilities: Default debug OFF");
      assert(output.devModeOverridesEnabled === false, "Capabilities: Default dev mode OFF");
  });

  // B. Debug Enabled ONLY (No Overrides Flag)
  withEnv({ FOLE_DEV_ENABLE_DEBUG_ENDPOINTS: "1" }, () => {
      const ctx = mockCtx(LOCALHOST);
      const output = {
          debugEndpointsEnabled: ModeGate.debugEndpointsEnabled(ctx),
          devModeOverridesEnabled: ModeGate.canUseDevAuthBypass(ctx)
      };
      
      assert(output.debugEndpointsEnabled === true, "Capabilities: Debug ON when configured");
      assert(output.devModeOverridesEnabled === false, "Capabilities: Dev/Expert Mode OFF (missing overrides flag)");
  });

  // C. Dev/Expert Mode Enabled (Overrides Only)
  withEnv({ FOLE_DEV_ALLOW_MODE_OVERRIDES: "1" }, () => {
      const ctx = mockCtx(LOCALHOST);
      const output = {
          debugEndpointsEnabled: ModeGate.debugEndpointsEnabled(ctx),
          devModeOverridesEnabled: ModeGate.canUseDevAuthBypass(ctx)
      };
      
      assert(output.debugEndpointsEnabled === false, "Capabilities: Debug OFF (requires ENABLE_DEBUG_ENDPOINTS)");
      assert(output.devModeOverridesEnabled === true, "Capabilities: Dev Overrides ON");
  });

  // D. Both Enabled
  withEnv({ FOLE_DEV_ALLOW_MODE_OVERRIDES: "1", FOLE_DEV_ENABLE_DEBUG_ENDPOINTS: "1" }, () => {
      const ctx = mockCtx(LOCALHOST);
      const output = {
          debugEndpointsEnabled: ModeGate.debugEndpointsEnabled(ctx),
          devModeOverridesEnabled: ModeGate.canUseDevAuthBypass(ctx)
      };
      
      assert(output.debugEndpointsEnabled === true, "Capabilities: Debug ON");
      assert(output.devModeOverridesEnabled === true, "Capabilities: Dev Overrides ON");
  });

  console.log(`\nSummary: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) process.exit(1);
}

runTests();
