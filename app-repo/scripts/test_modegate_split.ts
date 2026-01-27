// dev-only test script
import { ModeGate } from "../src/server/ModeGate";

// Type shim for what ModeGate expects
function mockCtx(overrides: { remoteAddress: string }) {
    return {
        requestId: 'test',
        remoteAddress: overrides.remoteAddress,
        req: {} as any
    };
}

function withEnv(env: Record<string, string>, fn: () => void) {
    const oldEnv = { ...process.env };
    Object.assign(process.env, env);
    try {
        fn();
    } finally {
        process.env = oldEnv;
    }
}

function run() {
    console.log("[test_modegate_split] Starting...");

    // 1. Assert Independence of Flags
    // Debug Endpoints: FOLE_DEV_ENABLE_DEBUG_ENDPOINTS
    // Dev Auth Bypass: FOLE_DEV_ALLOW_MODE_OVERRIDES

    console.log("Test: Localhost Envs...");
    withEnv({ 
        FOLE_DEV_ENABLE_DEBUG_ENDPOINTS: "1", 
        FOLE_DEV_ALLOW_MODE_OVERRIDES: "0" 
    }, () => {
        const ctx = mockCtx({ remoteAddress: "127.0.0.1" });
        const canDebug = ModeGate.debugEndpointsEnabled(ctx as any);
        const canBypass = ModeGate.canUseDevAuthBypass(ctx as any);
        
        if (canDebug === true && canBypass === false) {
            console.log("PASS: Debug=On, Bypass=Off works correctly.");
        } else {
            console.error(`FAIL: Expected Debug=T, Bypass=F. Got Debug=${canDebug}, Bypass=${canBypass}`);
        }
    });

    withEnv({ 
        FOLE_DEV_ENABLE_DEBUG_ENDPOINTS: "0", 
        FOLE_DEV_ALLOW_MODE_OVERRIDES: "1" 
    }, () => {
        const ctx = mockCtx({ remoteAddress: "127.0.0.1" });
        const canDebug = ModeGate.debugEndpointsEnabled(ctx as any);
        const canBypass = ModeGate.canUseDevAuthBypass(ctx as any);
        
        if (canDebug === false && canBypass === true) {
            console.log("PASS: Debug=Off, Bypass=On works correctly.");
        } else {
             console.error(`FAIL: Expected Debug=F, Bypass=T. Got Debug=${canDebug}, Bypass=${canBypass}`);
        }
    });

    // 2. Assert Non-Localhost Rejects All
    console.log("Test: Non-Localhost Safety...");
    withEnv({ 
        FOLE_DEV_ENABLE_DEBUG_ENDPOINTS: "1", 
        FOLE_DEV_ALLOW_MODE_OVERRIDES: "1" 
    }, () => {
        const ctx = mockCtx({ remoteAddress: "192.168.1.50" });
        const canDebug = ModeGate.debugEndpointsEnabled(ctx as any);
        const canBypass = ModeGate.canUseDevAuthBypass(ctx as any);
        
        if (canDebug === false && canBypass === false) {
            console.log("PASS: Non-localhost blocked both despite env vars.");
        } else {
            console.error(`FAIL: Non-localhost leaked permissions! Debug=${canDebug}, Bypass=${canBypass}`);
        }
    });
}

run();