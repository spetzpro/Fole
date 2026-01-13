import { spawn } from 'child_process';
import * as net from 'net';
import * as http from 'http';
import { platform } from 'os';
import { execSync } from 'child_process';

export interface TestServerOptions {
    devMode?: boolean;
    startupTimeoutMs?: number;
    testTimeoutMs?: number;
}

export interface TestServerContext {
    baseUrl: string;
    port: number;
}

export async function withTestServer(
    opts: TestServerOptions,
    fn: (ctx: TestServerContext) => Promise<void>
): Promise<void> {
    const startupTimeout = opts.startupTimeoutMs || 15000;
    const testTimeout = opts.testTimeoutMs || 30000;
    
    // 1. Find free port
    const port = await new Promise<number>((resolve, reject) => {
        const s = net.createServer();
        s.listen(0, '127.0.0.1', () => {
             const address = s.address();
             if (address && typeof address === 'object') {
                 const p = address.port;
                 s.close(() => resolve(p));
             } else {
                 reject(new Error("Failed to get port"));
             }
        });
        s.on('error', reject);
    });

    console.log(`[HARNESS] Selected port: ${port}`);

    // 2. Spawn server
    const env: NodeJS.ProcessEnv = { 
        ...process.env, 
        PORT: String(port)
    };

    if (opts.devMode) {
        env['FOLE_DEV_ALLOW_MODE_OVERRIDES'] = "1";
        env['FOLE_DEV_FORCE_INVALID_CONFIG'] = "1";
    }

    const cmd = platform() === 'win32' ? 'npx.cmd' : 'npx';
    const args = ['ts-node', '--project', 'tsconfig.json', 'app-repo/src/server/serverMain.ts'];

    console.log(`[HARNESS] Spawning server...`);
    // stdio: ignore stdin, ignore stdout (we don't need it), pipe stderr so we can see errors
    const serverProcess = spawn(cmd, args, {
        env,
        cwd: process.cwd(),
        stdio: ['ignore', 'ignore', 'pipe'], 
        shell: platform() === 'win32'
    });

    serverProcess.stderr?.on('data', (d) => process.stderr.write(`[SERVER STDERR] ${d}`));

    // Robust Kill Helper
    const killServer = async () => {
        if (!serverProcess || serverProcess.killed || serverProcess.exitCode !== null) {
            return;
        }

        console.log(`[HARNESS] Killing server (PID ${serverProcess.pid})...`);
        serverProcess.kill(); // SIGTERM

        // Wait for exit
        const exitPromise = new Promise<void>((resolve) => {
            const onExit = () => {
                resolve();
            };
            serverProcess.once('exit', onExit);
        });

        const timeoutPromise = new Promise<void>((_, reject) => {
            const t = setTimeout(() => reject(new Error("Kill timeout")), 2000);
            t.unref?.();
        });

        try {
            await Promise.race([exitPromise, timeoutPromise]);
            console.log(`[HARNESS] Server exited gracefully.`);
        } catch (e) {
            console.log(`[HARNESS] Server did not exit, forcing taskkill...`);
            if (platform() === 'win32' && serverProcess.pid) {
                try {
                    execSync(`taskkill /F /T /PID ${serverProcess.pid}`, { stdio: 'ignore' });
                } catch (ignore) { /* already gone? */ }
            }
            
            // Wait one last time just to be sure
            try {
                await Promise.race([
                    exitPromise,
                    new Promise((_, r) => { const t = setTimeout(r, 1000); t.unref?.(); })
                ]);
            } catch (ignore) {}
        }
    };

    try {
        // 3. Wait for readiness
        const baseUrl = `http://127.0.0.1:${port}`;
        const start = Date.now();
        let ready = false;

        while (Date.now() - start < startupTimeout) {
            if (serverProcess.exitCode !== null) {
                throw new Error(`Server exited early with code ${serverProcess.exitCode}`);
            }

            try {
                await new Promise<void>((resolve, reject) => {
                    const req = http.get(`${baseUrl}/api/health`, (res) => {
                        if (res.statusCode === 200) {
                            res.resume(); // consume any data
                            resolve();
                        } else {
                            res.resume();
                            reject(new Error(`Status ${res.statusCode}`));
                        }
                    });
                    req.on('error', reject);
                    req.end();
                });
                ready = true;
                break;
            } catch (e) {
                await new Promise(r => {
                    const t = setTimeout(r, 200);
                    t.unref?.(); // Ensure this timer doesn't hold process open
                });
            }
        }

        if (!ready) {
            throw new Error("Server startup timeout - failing health check");
        }

        console.log(`[HARNESS] Server ready at ${baseUrl}`);

        // 4. Run test function with hard timeout
        await Promise.race([
            fn({ baseUrl, port }),
            new Promise((_, reject) => {
                const t = setTimeout(() => reject(new Error(`Test timed out after ${testTimeout}ms`)), testTimeout);
                t.unref?.();
            })
        ]);

    } finally {
        await killServer();
    }
}
