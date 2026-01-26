// dev-only-test
import { requirePermission } from '../src/server/DevPermissionGuard';

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

function mockCtx(headers: Record<string, string>, remoteAddress: string = "127.0.0.1") {
    // Mocking minimal RequestContext
    return { 
        req: { headers }, 
        remoteAddress,
        requestId: 'test-req', 
        auth: undefined // Simulate no extracted auth from upstream by default
    } as any;
}

function run() {
    console.log("Testing DevPermissionGuard...");

    // 1. PROD MODE (No overrides allowed)
    withEnv({ FOLE_DEV_ALLOW_MODE_OVERRIDES: "" }, () => {
        let res = requirePermission(mockCtx({}, "127.0.0.1"), 'sysadmin.config.preflight');
        if (res.success || res.status !== 401) console.error("FAIL: Prod Mode Unauth should be 401", res);
        else console.log("PASS: Prod Mode -> 401");
    });

    // 2. DEV MODE + Localhost + Dev Auth Header (Success)
    withEnv({ FOLE_DEV_ALLOW_MODE_OVERRIDES: "1", FOLE_DEV_ENABLE_DEBUG_ENDPOINTS: "1" }, () => {
        const devHeader = JSON.stringify({ roles: ["ADMIN"] });
        
        // Correct Usage: Success
        let res = requirePermission(mockCtx({ 'x-dev-auth': devHeader }, "127.0.0.1"), 'sysadmin.config.preflight');
        
        if (!res.success) console.error("FAIL: Dev Mode Valid should succeed", res);
        else console.log("PASS: Dev Mode + Header -> Success");

        // Wrong IP (Fail)
        res = requirePermission(mockCtx({ 'x-dev-auth': devHeader }, "10.0.0.99"), 'sysadmin.config.preflight');
        if (res.success || res.status !== 401) console.error("FAIL: Dev Mode Remote IP should be 401", res);
        else console.log("PASS: Dev Mode Remote IP -> 401");

        // Missing Perm (Fail)
        const weakHeader = JSON.stringify({ roles: ["VIEWER"] });
        res = requirePermission(mockCtx({ 'x-dev-auth': weakHeader }, "127.0.0.1"), 'sysadmin.config.preflight');
        if (res.success) console.error("FAIL: Weak Role should fail", res);
        else console.log("PASS: Dev Mode Weak Role -> 401 (Falls through Dev Guard)");
    });
}

run();
