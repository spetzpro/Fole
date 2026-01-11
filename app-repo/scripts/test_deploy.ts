
console.log("Script starting...");
// import axios from "axios"; // Removing invalid import
import { ShellBundle } from "../src/server/ShellConfigTypes";

// Using native http to avoid external deps for test script if possible, or assume axios not present.
// I will use parsed URL + http module as I did before.

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

function get(path: string) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:3000${path}`, (res: any) => {
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
    }).on("error", reject);
  });
}

const VALID_BUNDLE = {
  manifest: {
    schemaVersion: "1.0.0",
    regions: {
      top: { blockId: "header" },
      bottom: { blockId: "footer" },
      main: { blockId: "viewport" }
    }
  },
  blocks: {
    header: {
      blockId: "header",
      blockType: "header",
      schemaVersion: "1.0.0",
      data: { title: "New Deployed App" }
    },
    footer: {
      blockId: "footer",
      blockType: "footer",
      schemaVersion: "1.0.0",
      data: { copyright: "2027" }
    },
    viewport: {
      blockId: "viewport",
      blockType: "viewport",
      schemaVersion: "1.0.0",
      data: { defaultZoom: 2 }
    }
  }
};

const INVALID_BUNDLE = {
  manifest: {
    schemaVersion: "1.0.0",
    regions: {
      top: { blockId: "header_missing" }
    }
  },
  blocks: {
     // Missing block
  }
};

async function run() {
  console.log("--- Testing Deploy Valid Bundle ---");
  const res1: any = await post("/api/config/shell/deploy", { message: "Test Deploy", bundle: VALID_BUNDLE });
  console.log("Status:", res1.status);
  console.log("Active Version:", res1.body.activeVersionId);

  if (res1.status === 200) {
    const deployedVersion = res1.body.activeVersionId;
    
    console.log("\n--- Verifying Active Pointer ---");
    const activeRes: any = await get("/api/config/shell/active");
    if (activeRes.body.activeVersionId === deployedVersion) {
        console.log("Active pointer updated correctly.");
    } else {
        console.error("Active pointer MISMATCH.", activeRes.body);
    }

    console.log("\n--- Testing Rollback to v1 ---");
    const resRollback: any = await post("/api/config/shell/rollback", { versionId: "v1" });
    console.log("Status:", resRollback.status);
    console.log("Active Version:", resRollback.body.activeVersionId);
    
     const activeRes2: any = await get("/api/config/shell/active");
    if (activeRes2.body.activeVersionId === "v1") {
        console.log("Rollback successful.");
    } else {
        console.error("Rollback FAILED.", activeRes2.body);
    }

  } else {
      console.error("Deploy failed:", res1.body);
  }

  console.log("\n--- Testing Deploy Invalid Bundle ---");
  const res2: any = await post("/api/config/shell/deploy", { message: "Invalid Deploy", bundle: INVALID_BUNDLE });
  console.log("Status:", res2.status);
  if (res2.status === 400 && res2.body.report) {
      console.log("Rejected correctly as 400 with report.");
  } else {
      console.error("Unexpected response for invalid deploy:", res2.status, res2.body);
  }
}

run();
