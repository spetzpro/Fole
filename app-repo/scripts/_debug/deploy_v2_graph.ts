
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
            "infra-windows": {
                blockId: "infra-windows",
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
    }
}

deploy();
