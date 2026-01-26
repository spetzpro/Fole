import { requirePermission } from '../src/server/ProductionGuard';

function mockCtx(headers: Record<string, string>) {
    return { req: { headers } } as any;
}

function run() {
    console.log("Testing ProductionGuard...");
    
    // 1. Missing Auth
    let res = requirePermission(mockCtx({}), 'sysadmin.config.preflight');
    if (res.success || res.status !== 401) console.error("FAIL: Missing Auth should be 401", res);
    else console.log("PASS: Missing Auth -> 401");

    // 2. Bad Scheme
    res = requirePermission(mockCtx({ 'authorization': 'Basic Foo' }), 'sysadmin.config.preflight');
    if (res.success || res.status !== 401) console.error("FAIL: Bad Scheme should be 401", res);
    else console.log("PASS: Bad Scheme -> 401");

    // 3. Bad Token
    res = requirePermission(mockCtx({ 'authorization': 'Bearer bad-token' }), 'sysadmin.config.preflight');
    if (res.success || res.status !== 401) console.error("FAIL: Bad Token should be 401", res);
    else console.log("PASS: Bad Token -> 401");
    
    const token = process.env.SYSADMIN_TOKEN || "sysadmin-secret-123";

    // 4. Good Token, Good Permission
    res = requirePermission(mockCtx({ 'authorization': `Bearer ${token}` }), 'sysadmin.config.preflight');
    if (!res.success) console.error("FAIL: Good Token should succeed", res);
    else console.log("PASS: Good Token -> Success");

    // 5. Good Token, Missing Permission
    res = requirePermission(mockCtx({ 'authorization': `Bearer ${token}` }), 'unknown.permission');
    if (res.success || res.status !== 403) console.error("FAIL: Missing Permission should be 403", res);
    else console.log("PASS: Missing Permission -> 403");
}

run();
