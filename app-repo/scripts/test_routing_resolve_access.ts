
import http from "http";
import { spawn, ChildProcess } from "child_process";
import path from "path";

const SERVER_PORT = 3000;
const SERVER_SCRIPT = path.join(__dirname, "../src/server/serverMain.ts");

// Helper to make requests
function request(path: string, headers: Record<string, string> = {}): Promise<{ status: number, body: any }> {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: "127.0.0.1",
            port: SERVER_PORT,
            path: path,
            method: "GET",
            headers: headers
        }, (res) => {
            let data = "";
            res.on("data", chunk => data += chunk);
            res.on("end", () => {
                try {
                    const body = JSON.parse(data);
                    resolve({ status: res.statusCode || 0, body });
                } catch {
                    resolve({ status: res.statusCode || 0, body: data });
                }
            });
        });
        req.on("error", reject);
        req.end();
    });
}

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function startServer(): Promise<ChildProcess> {
    console.log("Starting server...");
    // Use ts-node to run server
    const serverProc = spawn("npx.cmd", ["ts-node", SERVER_SCRIPT], {
        cwd: process.cwd(),
        env: { 
            ...process.env, 
            PORT: String(SERVER_PORT),
            // ENABLE DEV MODE FOR TESTS
            FOLE_DEV_ALLOW_MODE_OVERRIDES: "1",
            FOLE_DEV_FORCE_INVALID_CONFIG: "1" // This combo allows dev mode according to ModeGate logic
        },
        stdio: "inherit",
        shell: true
    });
    
    // Wait for port
    for (let i = 0; i < 20; i++) {
        await sleep(1000);
        try {
            await request("/api/health");
            console.log("Server is up.");
            return serverProc;
        } catch (e) {
            process.stdout.write(".");
        }
    }
    throw new Error("Server failed to start");
}

async function runTests() {
    let server: ChildProcess | null = null;
    let exitCode = 0;

    try {
        server = await startServer();

        console.log("\n=== Test 1: Secure Route (No Auth) ===");
        const t1 = await request("/api/routing/resolve/secure");
        if (t1.status === 401) {
             console.log("✅ PASS: 401 Unauthorized received for no header");
        } else {
             console.error(`❌ FAIL: Expected 401, got ${t1.status}`, t1.body);
             exitCode = 1;
        }

        console.log("\n=== Test 2: Secure Route (Wrong Role) ===");
        const t2 = await request("/api/routing/resolve/secure", {
            "x-dev-auth": JSON.stringify({ roles: ["user"] })
        });
        if (t2.status === 403) {
             console.log("✅ PASS: 403 Forbidden received for missing role");
        } else {
             console.error(`❌ FAIL: Expected 403, got ${t2.status}`, t2.body);
             exitCode = 1;
        }

        console.log("\n=== Test 3: Secure Route (Correct Role) ===");
        const t3 = await request("/api/routing/resolve/secure", {
            "x-dev-auth": JSON.stringify({ roles: ["admin"] })
        });
        if (t3.status === 200 && t3.body.allowed) {
             console.log("✅ PASS: 200 Allowed received for admin role");
             console.log("Details:", t3.body);
        } else {
             console.error(`❌ FAIL: Expected 200, got ${t3.status}`, t3.body);
             exitCode = 1;
        }

        console.log("\n=== Test 4: Expression Protected (Not Permitted) ===");
        const t4 = await request("/api/routing/resolve/expr_protected", {
            "x-dev-auth": JSON.stringify({ permissions: [] })
        });
        if (t4.status === 403) {
             console.log("✅ PASS: 403 Forbidden received (Permission missing)");
        } else {
             console.error(`❌ FAIL: Expected 403, got ${t4.status}`, t4.body);
             exitCode = 1;
        }

        console.log("\n=== Test 5: Expression Protected (Permitted) ===");
        const t5 = await request("/api/routing/resolve/expr_protected", {
            "x-dev-auth": JSON.stringify({ permissions: ["can_access_expr"] })
        });
        if (t5.status === 200 && t5.body.allowed) {
             console.log("✅ PASS: 200 Allowed received (Permission present)");
        } else {
             console.error(`❌ FAIL: Expected 200, got ${t5.status}`, t5.body);
             exitCode = 1;
        }

    } catch (err) {
        console.error("Test Error:", err);
        exitCode = 1;
    } finally {
        if (server) {
            console.log("Stopping server...");
            // Force kill tree (Windows specific often needed but we try standard)
            // On windows spawn with shell: true creates a wrapper, killing 'server.pid' might not kill node.
            // Using logic from smoke_server.ps1: "Stop-Process -Name node" is drastic but effective in isolation.
            // We'll use tree-kill or taskkill if available, or just process.kill.
            // Since we use 'spawn', let's try standard kill.
            server.kill();
            // Fallback for windows:
            if (process.platform === "win32") {
                spawn("taskkill", ["/pid", String(server.pid), "/f", "/t"]);
            }
        }
        process.exit(exitCode);
    }
}

runTests();
