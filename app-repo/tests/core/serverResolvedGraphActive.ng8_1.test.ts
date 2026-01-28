import * as path from "path";
import * as fs from "fs";
import { ShellConfigRepository } from "../../src/server/ShellConfigRepository";
import { ShellConfigDeployer } from "../../src/server/ShellConfigDeployer";
import { ShellConfigValidator } from "../../src/server/ShellConfigValidator";
import assert from "assert";

const TEST_DIR = path.join(__dirname, "serverResolvedGraphActive.test_env");

// Corrected Mock fixtures based on strict validation rules seen in NG7 test
const VALID_V1_CONFIG = {
    manifest: {
        schemaVersion: "1.0.0",
        regions: { header: { blockId: "h" }, footer: { blockId: "f" }, viewport: { blockId: "v" } },
        author: "ng8-test",
        timestamp: new Date().toISOString(),
        description: "Test V2 Active Graph"
    },
    blocks: {
        "h": { blockId: "h", blockType: "shell.region.header", schemaVersion: "1.0.0", data: { title: "T" } },
        "f": { blockId: "f", blockType: "shell.region.footer", schemaVersion: "1.0.0", data: { copyrightText: "C" } },
        "v": { blockId: "v", blockType: "shell.region.viewport", schemaVersion: "1.0.0", data: { rulesId: "vr" } },
        "vr": { blockId: "vr", blockType: "shell.rules.viewport", schemaVersion: "1.0.0", data: { allowZoom: true } },
        "r": { blockId: "r", blockType: "shell.infra.routing", schemaVersion: "1.0.0", data: { routes: {}, publishedLinks: {} } },
        "t": { blockId: "t", blockType: "shell.infra.theme_tokens", schemaVersion: "1.0.0", data: { tokens: {} } },
        "w": { blockId: "w", blockType: "shell.infra.window_registry", schemaVersion: "1.0.0", data: { windows: {} } },
        "m": { blockId: "m", blockType: "shell.overlay.main_menu", schemaVersion: "1.0.0", data: { items: [] } }
    }
};

async function runTest() {
    console.log("NG8.1: Server Resolved Graph Active Endpoint Logic Test");
    
    let repo: ShellConfigRepository;
    let validator: ShellConfigValidator;
    let deployer: ShellConfigDeployer;

    // cleanup
    if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DIR);
    fs.mkdirSync(path.join(TEST_DIR, "app-repo/config/shell"), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, "app-repo/config/defaults/shell"), { recursive: true });

    // Initialize fake defaults to pass ensureInitialized
    fs.writeFileSync(path.join(TEST_DIR, "app-repo/config/defaults/shell/active.json"), JSON.stringify({ activeVersionId: "v0" }));
    
    // Copy real schemas to test env so Validator can find them
    const realSchemaDir = path.join(process.cwd(), "app-repo/src/server/schemas");
    const testSchemaDir = path.join(TEST_DIR, "app-repo/src/server/schemas");
    
    fs.mkdirSync(testSchemaDir, { recursive: true });
    // Recursive copy function (Node 16.7+)
    // @ts-ignore
    await fs.promises.cp(realSchemaDir, testSchemaDir, { recursive: true });

    repo = new ShellConfigRepository(TEST_DIR);
    validator = new ShellConfigValidator(TEST_DIR);
    deployer = new ShellConfigDeployer(repo, validator, TEST_DIR);
    
    await repo.ensureInitialized();

    // 1. Create a V2 Bundle with valid ui nodes
    const bundleInput = {
        manifest: {
            // override versionId if needed, but deployer generates it usually
            versionId: "vMANUAL", 
            ...VALID_V1_CONFIG.manifest
        },
        blocks: {
            ...VALID_V1_CONFIG.blocks,
            "my_window": {
                blockId: "my_window",
                blockType: "ui.node.window",
                schemaVersion: "1.0.0",
                data: {
                    id: "my_window",
                    type: "ui.node.window",
                    title: "Active Test Window",
                    children: [{ blockId: "my_container" }]
                }
            },
            "my_container": {
                    blockId: "my_container",
                    blockType: "ui.node.container",
                    schemaVersion: "1.0.0",
                    data: {
                        id: "my_container",
                        type: "ui.node.container",
                        children: [{ blockId: "my_text" }]
                    }
            },
            "my_text": {
                blockId: "my_text",
                blockType: "ui.node.text",
                schemaVersion: "1.0.0",
                data: {
                    id: "my_text",
                    type: "ui.node.text",
                    content: "Hello Active Graph"
                }
            }
        }
    };

    // 2. Deploy (which promotes to active automatically in default deployer flow via deploy())
    await deployer.deploy(bundleInput);

    // 3. Verify Active Pointer
    const pointer = await repo.getActivePointer();
    assert(pointer?.activeVersionId, "Active version should exist");
    console.log("Active version:", pointer?.activeVersionId);

    // 4. Simulate the Endpoint Logic
    const activePointer = await repo.getActivePointer();
    if (!activePointer?.activeVersionId) throw new Error("No active pointer");
    
    const graph = await repo.getResolvedUiGraph(activePointer.activeVersionId);
    
    // 5. Assertions
    assert(graph !== undefined, "Graph should be resolved");
    // @ts-ignore
    const rootNodeId = graph.rootNodeId || (graph.rootNodeIds && graph.rootNodeIds[0]);
    
    // Note: root detection logic currently depends on window/orphan status. 
    // In strict NG3 checks, orphaned nodes cause failure, but windows are roots.
    // The graph compiler finds ALL windows as roots.
    
    assert(graph.nodesById["my_container"], "Container should exist");
    assert(graph.nodesById["my_text"], "Text should exist");
    
    // Check slots exist (NG6 feature check implicitly)
    assert(graph.slotsById, "Slots should exist");
    
    console.log("NG8.1 PASS: Active graph resolved successfully with correct nodes.");

    // Cleanup
    if (fs.existsSync(TEST_DIR)) {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
}

runTest().catch(err => {
    console.error("TEST FAILED:", err);
    process.exit(1);
});
