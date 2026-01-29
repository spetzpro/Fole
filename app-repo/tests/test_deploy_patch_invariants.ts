/**
 * TEST: Deploy Patch Invariants
 * 
 * Protects critical invariants of the shell configuration deployment process:
 * 1. Partial Config Updates (Patch Semantics): Ensuring that deploying a bundle with only changed blocks
 *    does NOT delete unrelated blocks (like window_registry or root-window) from the active configuration.
 * 2. Canonical Viewport: Ensuring that the deployment pipeline maintains a clean 'viewport' and 'viewport-rules'
 *    structure and doesn't introduce legacy 'viewport-placeholder' artifacts.
 * 
 * This test is HERMETIC: It uses a temporary directory for all file operations and mocks the validator.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ShellConfigDeployer } from '../src/server/ShellConfigDeployer';
import { ShellConfigRepository } from '../src/server/ShellConfigRepository';
import { ShellBundle, ValidationReport } from '../src/server/ShellConfigTypes';

// --- MOCK VALIDATOR ---
// Matches shape of ShellConfigValidator
class MockValidator {
    async validateBundle(bundle: ShellBundle['bundle']): Promise<ValidationReport> {
        return {
            status: "valid",
            validatorVersion: "mock",
            severityCounts: { A1: 0, A2: 0, B: 0 },
            errors: [],
            resolvedUiGraph: {
                 nodesById: {},
                 slotsById: {},
                 rootNodeIds: [],
                 diagnostics: { nodeCount: 0, edgeCount: 0 }
            }
        };
    }
}

async function runTest() {
    console.log("=== STARTING TEST: Deploy Patch Invariants ===");

    // 1. Setup Temp Directory
    const tempRoot = path.join(os.tmpdir(), 'fole_deploy_test_' + Date.now());
    // The Deployer expects {workspaceFolder}/app-repo/config/shell
    // So we must construct the folder structure inside tempRoot/app-repo...
    const appRepoPath = path.join(tempRoot, 'app-repo');
    const configPath = path.join(appRepoPath, 'config', 'shell');
    
    await fs.promises.mkdir(path.join(configPath, 'archive'), { recursive: true });
    
    try {
        // 2. Setup Active Version (V1 - Canonical Shell)
        const v1Id = 'v1Context';
        const v1Path = path.join(configPath, 'archive', v1Id);
        const v1BundlePath = path.join(v1Path, 'bundle');
        await fs.promises.mkdir(v1BundlePath, { recursive: true });

        // V1 Blocks
        const v1Blocks: Record<string, any> = {
            'viewport': {
                blockId: 'viewport',
                blockType: 'shell.region.viewport',
                data: { rulesId: 'viewport-rules', contentRootId: 'root-window' }
            },
            'viewport-rules': {
                blockId: 'viewport-rules',
                blockType: 'shell.rules.viewport',
                data: {}
            },
            'root-window': {
                blockId: 'root-window',
                blockType: 'ui.node.window',
                data: { title: 'Main Window' }
            },
            'window_registry': {
                blockId: 'window_registry',
                blockType: 'shell.infra.window_registry',
                data: {}
            },
            'v2-text-1': {
                blockId: 'v2-text-1',
                blockType: 'ui.atom.text',
                data: { text: "Original Text" }
            }
        };

        const v1Manifest = {
            schemaVersion: "1.0.0",
            title: "V1 Canonical",
            regions: {
                viewport: { blockId: "viewport" }
            }
        };

        // Write V1 files
        await fs.promises.writeFile(path.join(v1Path, 'meta.json'), JSON.stringify({ versionId: v1Id }));
        await fs.promises.writeFile(path.join(v1Path, 'validation.json'), JSON.stringify({ isValid: true }));
        await fs.promises.writeFile(path.join(v1BundlePath, 'shell.manifest.json'), JSON.stringify(v1Manifest));
        for (const [id, blk] of Object.entries(v1Blocks)) {
            await fs.promises.writeFile(path.join(v1BundlePath, `${id}.json`), JSON.stringify(blk));
        }

        // Write Active Pointer
        const pointer = { activeVersionId: v1Id, activatedAt: new Date().toISOString(), safeMode: false };
        await fs.promises.writeFile(path.join(configPath, 'active.json'), JSON.stringify(pointer));


        // 3. Initialize System
        const repo = new ShellConfigRepository(tempRoot);
        const validator = new MockValidator();
        const deployer = new ShellConfigDeployer(repo, validator as any, tempRoot);

        console.log(`System Initialized in ${tempRoot}`);


        // 4. Perform Partial Deploy (The Patch)
        // We simulate a user changing "v2-text-1" and deploying ONLY that block.
        // We DO NOT include the viewport or window registry in this partial bundle.
        const partialBundleInput = {
            manifest: {
                // Manifest might be partial or full in a deploy. usually the UI sends the full current manifest it knows?
                // But let's assume it sends strict partial update logic where it might miss deep keys.
                // Actually, let's send just the regions needed (or none if not changing regions).
                // Let's assume the UI sends the manifest as it holds it.
                regions: {
                    viewport: { blockId: "viewport" }
                }
            },
            blocks: {
                // ONLY the changed block
                'v2-text-1': {
                    blockId: 'v2-text-1',
                    blockType: 'ui.atom.text',
                    data: { text: "UPDATED Text" }
                }
            }
        };

        console.log("Deploying Partial Update...");
        const result = await deployer.deploy(partialBundleInput as any, "Partial Update Test");
        console.log(`Deployed new version: ${result.activeVersionId}`);


        // 5. Assertions
        const v2Bundle = await repo.getBundle(result.activeVersionId);
        
        // A. Check Patch Application
        const textBlock = v2Bundle.bundle.blocks['v2-text-1'];
        if (!textBlock || textBlock.data.text !== "UPDATED Text") {
             throw new Error(`FAIL: Partial update did not apply. Expected 'UPDATED Text', got ${textBlock?.data?.text}`);
        }
        console.log("PASS: Partial update applied.");

        // B. Check Persistence (Unrelated blocks must remain)
        if (!v2Bundle.bundle.blocks['window_registry']) {
            throw new Error("FAIL: window_registry disappeared! Partial deploy clobbered existing blocks.");
        }
        if (!v2Bundle.bundle.blocks['root-window']) {
            throw new Error("FAIL: root-window disappeared!");
        }
        console.log("PASS: Unrelated blocks persisted.");

        // C. Check Viewport Canonicalization
        // ensure normalizeViewportRegion didn't spawn placeholders or break links
        const viewport = v2Bundle.bundle.blocks['viewport'];
        if (!viewport) {
             throw new Error("FAIL: Viewport block missing.");
        }
        if (viewport.blockType !== 'shell.region.viewport') {
             throw new Error("FAIL: Viewport type changed or corrupted.");
        }
        if (viewport.data.contentRootId !== 'root-window') {
             throw new Error(`FAIL: Viewport contentRootId lost. Got ${viewport.data.contentRootId}`);
        }
        
        // Ensure no placeholders spawned
        const placeholders = Object.keys(v2Bundle.bundle.blocks).filter(k => k.includes('placeholder'));
        if (placeholders.length > 0) {
            throw new Error(`FAIL: Canonicalization introduced placeholders: ${placeholders.join(', ')}`);
        }
        console.log("PASS: Viewport remains canonical.");

        console.log("=== ALL TESTS PASSED ===");

    } catch (err) {
        console.error("Test Failed:", err);
        process.exit(1);
    } finally {
        // Cleanup
        try {
           await fs.promises.rm(tempRoot, { recursive: true, force: true });
        } catch(e) { /* ignore */ }
    }
}

runTest();
