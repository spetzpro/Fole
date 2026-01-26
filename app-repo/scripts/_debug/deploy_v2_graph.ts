/**
 * REPL Deployment Script (Dev Only)
 * 
 * Usage:
 *   npx ts-node app-repo/scripts/_debug/deploy_v2_graph.ts
 * 
 * Purpose:
 *   Deploys a V2 graph bundle with a Window Node to the running backend.
 *   This generates a proper validation structure in the active archive.
 */

import { ShellBundle } from "../../src/server/ShellConfigTypes";

const http = require("http");

function post(path: string, body: any) {
  return new Promise((resolve, reject) => {
    const json = JSON.stringify(body);
    const req = http.request({
      hostname: "127.0.0.1",
      port: 3000,
      path: path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(json)
      }
    }, (res: any) => {
      let data = "";
      res.on("data", (chunk: any) => data += chunk);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    
    req.on("error", reject);
    req.write(json);
    req.end();
  });
}

const V2_BUNDLE = {
    bundle: {
        manifest: {
            schemaVersion: "1.0.0",
            regions: {
                header: { blockId: "header" },
                footer: { blockId: "footer" },
                main: { blockId: "viewport-placeholder" }
            }
        },
        blocks: {
            "header": {
                blockId: "header",
                blockType: "shell.region.header",
                schemaVersion: "1.0.0",
                data: { title: "V2 Preview App" }
            },
            "footer": {
                blockId: "footer",
                blockType: "shell.region.footer",
                schemaVersion: "1.0.0",
                data: { copyrightText: "2026" }
            },
            "viewport-placeholder": {
                blockId: "viewport-placeholder",
                blockType: "shell.rules.viewport",
                schemaVersion: "1.0.0",
                data: { allowZoom: true, defaultZoom: 1, minZoom: 0.5, maxZoom: 2 }
            },
            "root-window": {
                blockId: "root-window",
                blockType: "ui.node.window",
                schemaVersion: "1.0.0",
                data: {
                    id: "root-window",
                    type: "ui.node.window",
                    title: "Main Window",
                    dockable: true,
                    children: [ { blockId: "root-container" } ]
                }
            },
            "root-container": {
                blockId: "root-container",
                blockType: "ui.node.container",
                schemaVersion: "1.0.0",
                data: {
                    id: "root-container",
                    type: "ui.node.container",
                    direction: "column",
                    children: [{blockId: "v2-text-1"}, {blockId: "v2-btn-1"}]
                }
            },
            "v2-text-1": {
                blockId: "v2-text-1",
                blockType: "ui.node.text",
                schemaVersion: "1.0.0",
                data: {
                    id: "v2-text-1",
                    type: "ui.node.text",
                    content: "Hello from Verified V2 Graph!"
                }
            },
            "v2-btn-1": {
                blockId: "v2-btn-1",
                blockType: "ui.node.button",
                schemaVersion: "1.0.0",
                data: {
                    id: "v2-btn-1",
                    type: "ui.node.button",
                    label: "Click Me",
                    behaviors: {
                        onClick: {
                            actionId: "action-logger-v2"
                        }
                    }
                }
            },
            "infra-routing": {
                blockId: "infra-routing",
                blockType: "shell.infra.routing",
                schemaVersion: "1.0.0",
                data: {
                    routes: {},
                    publishedLinks: {}
                }
            },
            "infra-theme": {
                blockId: "infra-theme",
                blockType: "shell.infra.theme_tokens",
                schemaVersion: "1.0.0",
                data: {
                    tokens: { "color.primary": "#007bff" }
                }
            },
            "window_registry": {
                blockId: "window_registry",
                blockType: "shell.infra.window_registry",
                schemaVersion: "1.0.0",
                data: {
                    windows: {}
                }
            },
            "overlay-menu": {
                blockId: "overlay-menu",
                blockType: "shell.overlay.main_menu",
                schemaVersion: "1.0.0",
                data: {
                    items: []
                }
            },
            // --- Feature Group: Fish Information ---
            "feature-fish-info": {
                blockId: "feature-fish-info",
                blockType: "feature.group",
                schemaVersion: "1.0.0",
                data: {
                    id: "feature.fish.info",
                    title: "Fish Information System",
                    description: "Reference material for maritime species",
                    tags: ["maritime", "reference"]
                }
            },
            // --- Action: Open Fish Window ---
            "action-open-fish": {
                blockId: "action-open-fish",
                blockType: "action.openWindow", 
                schemaVersion: "1.0.0",
                data: {
                    windowId: "root-window"
                }
            },
            // --- Slot Item: Header Button ---
            "slot-header-fish": {
                blockId: "slot-header-fish",
                blockType: "shell.slot.item",
                schemaVersion: "1.0.0",
                data: {
                    id: "slot.header.fish",
                    slotId: "app.header.right",
                    label: "Fish Info",
                    actionId: "action-open-fish",
                    icon: "info"
                }
            }
        }
    }
};

async function deploy() {
    console.log("--- Deploying V2 Graph ---");
    try {
        const res: any = await post("/api/config/shell/deploy", {
             message: "Inject V2 Data", 
             bundle: V2_BUNDLE.bundle 
        });
        
        console.log("Status:", res.status);
        if (res.status === 200) {
            console.log("Success! Active Version:", res.body.activeVersionId);
            console.log("You can now verify at http://localhost:5173/?v2Preview=1");
        } else {
            console.error("Failed:", JSON.stringify(res.body, null, 2));
        }
    } catch (e) {
        console.error("Connection failed. Is the server running on port 3000?");
        console.error(e);
        process.exit(1);
    }
}

deploy();
