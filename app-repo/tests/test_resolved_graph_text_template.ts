// Regression test: ensures ui.node.text templates apply defaults in the resolved graph (null tombstones must not leak).
// Guards a runtime bug where template defaults were ignored for text nodes.
import { ShellConfigValidator } from "../src/server/ShellConfigValidator";
import { ShellBundle } from "../src/server/ShellConfigTypes";

async function runTest() {
    console.log("Running Resolved Graph Text Template Test...");

    const repoRoot = process.cwd();
    const validator = new ShellConfigValidator(repoRoot);

    const bundle: ShellBundle["bundle"] = {
        manifest: {
            schemaVersion: "1.0.0",
            regions: {
                header: { blockId: "hdr" },
                footer: { blockId: "ftr" },
                viewport: { blockId: "vp" }
            }
        },
        blocks: {
            "hdr": { blockId: "hdr", blockType: "shell.region.header", schemaVersion: "1.0.0", data: { title: "T" } },
            "ftr": { blockId: "ftr", blockType: "shell.region.footer", schemaVersion: "1.0.0", data: { copyrightText: "C" } },
            "vp": { blockId: "vp", blockType: "shell.region.viewport", schemaVersion: "1.0.0", data: { rulesId: "vp-rules" } },
            "vp-rules": { blockId: "vp-rules", blockType: "shell.rules.viewport", schemaVersion: "1.0.0", data: { allowZoom: true } },
            "routing": { blockId: "routing", blockType: "shell.infra.routing", schemaVersion: "1.0.0", data: { routes: {}, publishedLinks: {} } },
            "theme": { blockId: "theme", blockType: "shell.infra.theme_tokens", schemaVersion: "1.0.0", data: { tokens: {} } },
            "windows": { blockId: "windows", blockType: "shell.infra.window_registry", schemaVersion: "1.0.0", data: { windows: {} } },
            "main-menu": { blockId: "main-menu", blockType: "shell.overlay.main_menu", schemaVersion: "1.0.0", data: { items: [] } },

            "tpl_text_body": {
                blockId: "tpl_text_body",
                blockType: "template",
                schemaVersion: "1.0.0",
                data: {
                    label: "Text Body",
                    enabled: true,
                    targetBlockType: "ui.node.text",
                    defaults: {
                        content: "Hello from template",
                        variant: "body"
                    }
                }
            },

            "text-container": {
                blockId: "text-container",
                blockType: "ui.node.container",
                schemaVersion: "1.0.0",
                data: {
                    id: "text-container",
                    type: "ui.node.container",
                    children: [{ blockId: "help-text" }]
                }
            },
            "help-text": {
                blockId: "help-text",
                blockType: "ui.node.text",
                schemaVersion: "1.0.0",
                data: {
                    id: "help-text",
                    type: "ui.node.text",
                    inheritFrom: "tpl_text_body",
                    content: null,
                    helpText: ""
                }
            }
        }
    };

    const report = await validator.validateBundle(bundle);
    if (report.status !== "valid") {
        console.error("FAIL: Bundle invalid", report.errors);
        process.exit(1);
    }

    const graph = report.resolvedUiGraph;
    if (!graph) {
        console.error("FAIL: Missing resolvedUiGraph");
        process.exit(1);
    }

    const helpTextNode = graph.nodesById["help-text"];
    const effectiveContent = helpTextNode?.props?.content;
    if (effectiveContent !== "Hello from template") {
        console.error("FAIL: Expected template content, got", effectiveContent);
        process.exit(1);
    }

    console.log("PASS");
}

runTest().catch((err) => {
    console.error("Test Exception:", err);
    process.exit(1);
});
