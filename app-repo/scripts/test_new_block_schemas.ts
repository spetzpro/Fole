// dev-only test script
import { ShellConfigValidator } from "../src/server/ShellConfigValidator";
import { ShellBundle } from "../src/server/ShellConfigTypes";
import * as path from "path";

async function run() {
    console.log("[test_new_block_schemas] Starting...");
    const validator = new ShellConfigValidator(process.cwd());

    // Minimal Bundle
    const bundle: ShellBundle["bundle"] = {
        manifest: {
            schemaVersion: "1.0.0",
            regions: {
                header: { blockId: "header-block" }
            }
        },
        blocks: {
            "header-block": {
                blockId: "header-block",
                blockType: "shell.region.header",
                schemaVersion: "1.0.0",
                data: { title: "My App" }
            },
            // feature.group
            "my-feature": {
                blockId: "my-feature",
                blockType: "feature.group",
                schemaVersion: "1.0.0",
                data: {
                    defaultEnabled: true
                }
            },
            // shell.slot.item
            "my-slot-item": {
                blockId: "my-slot-item",
                blockType: "shell.slot.item",
                schemaVersion: "1.0.0",
                data: {
                    slotId: "app.header.right",
                    actionId: "open-win"
                }
            },
            // action.openWindow
            "open-win": {
                blockId: "open-win",
                blockType: "action.openWindow",
                schemaVersion: "1.0.0",
                data: {
                    windowId: "my-window"
                }
            }
        }
    };

    // 1. Valid Case
    console.log("Checking Valid Bundle...");
    const report = await validator.validateBundle(bundle);
    if (report.status !== 'valid') {
        console.error("FAIL: Valid bundle returned errors:", JSON.stringify(report.errors, null, 2));
    } else {
        console.log("PASS: Valid bundle OK.");
    }

    // 2. Invalid Case (action.openWindow missing windowId)
    console.log("Checking Invalid Bundle (missing windowId)...");
    const badBundle = JSON.parse(JSON.stringify(bundle));
    delete badBundle.blocks["open-win"].data.windowId;

    const reportBad = await validator.validateBundle(badBundle);
    if (reportBad.status === 'valid') {
        console.error("FAIL: Invalid bundle (missing windowId) passed validation!");
    } else {
        const hasSpecificError = reportBad.errors.some(e => 
            e.path.includes("open-win") && e.message.includes("required")
        );
        if (hasSpecificError) {
             console.log("PASS: Invalid bundle caught correctly.");
        } else {
             console.error("FAIL: Invalid bundle caught but error message unclear:", JSON.stringify(reportBad.errors, null, 2));
        }
    }
}

run().catch(e => console.error(e));