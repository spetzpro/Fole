/**
 * TEST: Bundle Healer Regression
 * 
 * Verifies that the 'healBundleInMemory' logic correctly fixes:
 * 1. Invalid routing keys (schema compliance)
 * 2. Canonical viewport structure
 * 3. References to unknown overlays
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ShellConfigRepository } from '../src/server/ShellConfigRepository';
import { ShellBundle } from '../src/server/ShellConfigTypes';

async function runTest() {
    console.log("=== STARTING TEST: Bundle Healer Regression ===");

    // 1. Setup Temp
    const tempRoot = path.join(os.tmpdir(), 'fole_healer_test_' + Date.now());
    const appRepoPath = path.join(tempRoot, 'app-repo');
    const configPath = path.join(appRepoPath, 'config', 'shell');
    await fs.promises.mkdir(path.join(configPath, 'archive'), { recursive: true });

    // 2. Initialize Repo
    const repo = new ShellConfigRepository(tempRoot);
    
    // 3. Construct INVALID Bundle
    const invalidBundle: ShellBundle['bundle'] = {
        manifest: {
            schemaVersion: "1.0.0",
            regions: {
                // FAILURE 2: Viewport points to Rules, not Host
                viewport: { blockId: "viewport-rules" }
            }
        },
        blocks: {
            "viewport-rules": {
                blockId: "viewport-rules",
                blockType: "shell.rules.viewport",
                schemaVersion: "1.0.0",
                data: {}
            },
            // Note: Host "viewport" is missing, or maybe defined separately?
            // Healer relies on normalizeBundleInMemory which expects SOME data.
            // Let's provide a placeholder host to be normalized.
            "viewport-placeholder": {
                blockId: "viewport-placeholder",
                blockType: "shell.region.viewport",
                schemaVersion: "1.0.0",
                data: { contentRootId: "root-window" }
            },
            
            "routing": {
                blockId: "routing",
                blockType: "shell.infra.routing",
                schemaVersion: "1.0.0",
                data: {
                    routes: {
                        "valid-route": { targetBlockId: "page1" },
                        "Invalid Route!": { targetBlockId: "page2" } // FAILURE 1: Bad Key
                    },
                    publishedLinks: []
                }
            },
            
            "btn_help": {
                blockId: "btn_help",
                blockType: "shell.control.button",
                schemaVersion: "1.0.0",
                data: {
                    label: "Help",
                    interactions: {
                        click: {
                            kind: "toggleOverlay",
                            params: {
                                overlayId: "help_overlay" // FAILURE 3: Unknown Overlay
                            }
                        },
                        hover: {
                            kind: "action.log",
                            params: { message: "hovering" }
                        }
                    }
                }
            }
        }
    };

    console.log("Running Healer...");
    const healed = ShellConfigRepository.healBundleInMemory(invalidBundle);

    // 4. Assertions
    
    // A. Routing
    const routing = healed.blocks['routing'];
    if (!routing) throw new Error("Routing block lost");
    const routes = (routing.data as any).routes;
    if (routes["Invalid Route!"]) throw new Error("FAIL: Invalid route key persisted");
    if (!routes["valid-route"]) throw new Error("FAIL: Valid route key lost");
    console.log("PASS: Routing keys sanitized.");

    // B. Viewport
    // normalizeBundleInMemory should have created "viewport" host and pointed manifest to it
    if (healed.manifest.regions.viewport.blockId !== "viewport") {
        throw new Error(`FAIL: Manifest viewport not canonical. Got ${healed.manifest.regions.viewport.blockId}`);
    }
    const host = healed.blocks['viewport'];
    if (!host || host.blockType !== "shell.region.viewport") {
        throw new Error("FAIL: Viewport Host block missing or wrong type");
    }
    if ((host.data as any).contentRootId !== "root-window") {
        throw new Error("FAIL: Viewport contentRootId validation failed");
    }
    console.log("PASS: Viewport canonicalized.");

    // C. Overlays
    const btn = healed.blocks['btn_help'];
    const inter = (btn.data as any).interactions;
    if (inter.click) throw new Error("FAIL: Invalid overlay interaction persisted");
    if (!inter.hover) throw new Error("FAIL: Valid interaction lost");
    console.log("PASS: Unknown overlay interactions removed.");

    // 5. Assert Persistence
    console.log("Testing Persistence...");
    const { newVersionId } = await repo.saveHealedBundleAsVersion(
        healed, 
        "vBase", 
        "Healing Test"
    );
    
    const savedPath = path.join(configPath, 'archive', newVersionId, 'bundle');
    if (!fs.existsSync(savedPath)) throw new Error("FAIL: Persisted bundle not found on disk");
    
    const savedRouting = JSON.parse(await fs.promises.readFile(path.join(savedPath, 'routing.json'), 'utf-8'));
    if (savedRouting.data.routes["Invalid Route!"]) throw new Error("FAIL: Saved bundle contains invalid route");
    
    console.log("PASS: Persistence validated.");
    console.log("=== ALL TESTS PASSED ===");
    
    // Cleanup
    try { await fs.promises.rm(tempRoot, { recursive: true, force: true }); } catch {}
}

runTest().catch(e => {
    console.error(e);
    process.exit(1);
});
