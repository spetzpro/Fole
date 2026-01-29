
import { withTestServer } from '../scripts/_test_server_harness';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';

// --- Helpers ---

function post(url: string, body: any): Promise<any> {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = http.request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
        }, (res) => {
            let buf = '';
            res.on('data', c => buf += c);
            res.on('end', () => {
                if (res.statusCode === 200) resolve(JSON.parse(buf));
                else reject(new Error(`POST ${url} failed: ${res.statusCode} ${buf}`));
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

function get(url: string, expectStatus = 200): Promise<any> {
    return new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
            let buf = '';
            res.on('data', c => buf += c);
            res.on('end', () => {
                if (res.statusCode === expectStatus) {
                    try {
                        resolve(JSON.parse(buf));
                    } catch (e) {
                         // Maybe not JSON
                        resolve(buf);
                    }
                }
                else reject(new Error(`GET ${url} failed: ${res.statusCode} ${buf}`));
            });
        });
        req.on('error', reject);
    });
}

const MINIMAL_VALID_BUNDLE = {
    manifest: {
        schemaVersion: "1.0.0",
        regions: {
            "main": { blockId: "viewport" }
        },
        routes: [],
        overlays: []
    },
    blocks: {
        "viewport": {
            "blockId": "viewport",
            "blockType": "shell.region.viewport",
            "data": {}
        }
    }
};

// --- Test ---

async function run() {
    // Enable Force Invalid for testing
    process.env.FOLE_DEV_FORCE_INVALID_CONFIG = "1";
    
    console.log("Starting Fallback E2E Test...");
    
    await withTestServer({ devMode: true, startupTimeoutMs: 30000 }, async (ctx) => {
        const baseUrl = ctx.baseUrl; // e.g. http://127.0.0.1:xxx
        
        console.log(`[TEST] Server running at ${baseUrl}`);
        
        // 1. Deploy a known valid version to establish "Active"
        console.log(`[TEST] Deploying initial bundle...`);
        const deployRes = await post(`${baseUrl}/api/config/shell/deploy`, {
            bundle: MINIMAL_VALID_BUNDLE,
            message: "Setup Active Version",
            forceInvalid: true
        });
        
        const activeVersionId = deployRes.activeVersionId;
        console.log(`[TEST] Active version is now: ${activeVersionId}`);
        
        if (!activeVersionId) {
             console.error("Deploy response:", deployRes);
             throw new Error("Deploy did not return activeVersionId");
        }
        
        // 2. Fetch a MISSING version -> Should Fallback to Active
        const missingId = "v-missing-999999";
        console.log(`[TEST] Fetching missing version ${missingId}...`);
        
        try {
            await get(`${baseUrl}/api/config/shell/bundle?versionId=${missingId}`);
            console.log("PASS: Got 200 OK (Unexpected for invalid bundle, but fallback worked)");
        } catch (e: any) {
            const msg = e.message || "";
            // We expect 400 because the active bundle is invalid (validation fails on read)
            // We do NOT expect 404 (Version not found)
            if (msg.includes("failed: 400")) {
                console.log("PASS: Got 400 Bad Request (Validation Error). This implies fallback worked because 404 would mean not found.");
            } else if (msg.includes("failed: 404")) {
                 throw new Error("FAIL: Got 404 Not Found. Fallback did not kick in.");
            } else {
                 throw e;
            }
        }

    });
}

run().catch(e => {
    console.error("Test Failed:", e);
    process.exit(1);
});
