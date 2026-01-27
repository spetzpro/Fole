// dev-only test script
import { withTestServer } from "./_test_server_harness";
import * as http from "http";

function doRequest(url: string, method: string, headers: Record<string, string>, body?: string): Promise<{status: number}> {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const options: http.RequestOptions = {
            hostname: u.hostname,
            port: u.port,
            path: u.pathname,
            method: method,
            headers: headers,
            timeout: 3000 // 3s socket timeout
        };
        const req = http.request(options, res => {
            resolve({ status: res.statusCode || 0 });
        });
        
        // Hard timeout using cancellation
        const timeoutId = setTimeout(() => {
            req.destroy(new Error("Request timed out (client-side limit 3000ms)"));
        }, 3000);

        req.on('error', (err) => {
            clearTimeout(timeoutId);
            reject(err);
        });
        
        req.on('response', () => {
             clearTimeout(timeoutId);
        });

        if (body) req.write(body);
        req.end();
    });
}

async function run() {
    console.log("[test_config_endpoint_guards] Starting...");

    // Case A: Prod Mode (no devs vars) -> Rejects without auth
    await withTestServer({ devMode: false, testTimeoutMs: 10000 }, async (ctx) => {
        console.log("Scenario A: Prod Mode (devMode=false)");
        
        // Fail-fast health verify
        try {
            const health = await doRequest(`${ctx.baseUrl}/api/health`, 'GET', {});
            if (health.status !== 200) {
                throw new Error(`Bootstrap Failed: /api/health returned ${health.status}`);
            }
        } catch (e: any) {
            console.error("FAIL: Server unreachable at start of test!", e.message);
            process.exit(1);
        }

        // Preflight
        try {
            const res = await doRequest(`${ctx.baseUrl}/api/config/shell/preflight/unknown`, 'GET', {});
            if (res.status === 401 || res.status === 403) {
                console.log(`PASS: Prod mode rejected preflight (Status: ${res.status}).`);
            } else {
                console.error(`FAIL: Prod mode allowed preflight! Status: ${res.status}`);
            }
        } catch (e: any) { console.error("FAIL: Network error", e.message); }

        // Activate
        try {
             const res = await doRequest(`${ctx.baseUrl}/api/config/shell/activate`, 'POST', {'Content-Type': 'application/json'}, '{}');
             if (res.status === 401 || res.status === 403) {
                 console.log(`PASS: Prod mode rejected activate (Status: ${res.status}).`);
             } else {
                 console.error(`FAIL: Prod mode allowed activate! Status: ${res.status}`);
             }
        } catch (e: any) { console.error("FAIL: Network error", e.message); }
    });

    // Case B: Dev Mode Allowed + X-Dev-Auth
    await withTestServer({ devMode: true, testTimeoutMs: 10000 }, async (ctx) => {
        console.log("Scenario B: Dev Mode (devMode=true) + Header");

        // Fail-fast health verify
        try {
            const health = await doRequest(`${ctx.baseUrl}/api/health`, 'GET', {});
            if (health.status !== 200) {
                 throw new Error(`Bootstrap Failed: /api/health returned ${health.status}`);
            }
        } catch (e: any) {
             console.error("FAIL: Server unreachable at start of test!", e.message);
             process.exit(1);
        }

        try {
            const res = await doRequest(`${ctx.baseUrl}/api/config/shell/preflight/unknown_ver`, 'GET', { 'X-Dev-Auth': '1' });
            if (res.status !== 403 && res.status !== 401) {
                console.log(`PASS: Dev mode allowed preflight (Status: ${res.status}).`);
            } else {
                console.error(`FAIL: Dev mode rejected preflight despite header! Status: ${res.status}`);
            }
        } catch (e: any) { console.error("FAIL: Network error", e.message); }

        try {
             // Sending dummy invalid data to ensure we hit logic beyond auth
             const res = await doRequest(`${ctx.baseUrl}/api/config/shell/activate`, 'POST', { 'Content-Type': 'application/json', 'X-Dev-Auth': '1' }, JSON.stringify({ versionId: "invalid" }));
             if (res.status !== 403 && res.status !== 401) {
                 console.log(`PASS: Dev mode allowed activate attempt (Status: ${res.status}).`);
             } else {
                 console.error(`FAIL: Dev mode rejected activate despite header! Status: ${res.status}`);
             }
        } catch (e: any) { console.error("FAIL: Network error", e.message); }
    });

    console.log("Scenario C: Non-Localhost checks are covered by unit tests in test_modegate_split.ts");
}

run().catch(e => console.error(e));