// Negative test for invalid bundle deployment
const http = require("http");

function post(path, body) {
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
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
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

// Bundle missing referenced block "footer"
const INVALID_BUNDLE = {
  manifest: {
    schemaVersion: "1.0.0",
    regions: {
      top: { blockId: "header" },
      bottom: { blockId: "footer" } // References "footer"
    }
  },
  blocks: {
    header: {
      blockId: "header",
      blockType: "header",
      schemaVersion: "1.0.0",
      data: { title: "Invalid App" }
    }
    // Missing "footer" block definition
  }
};

async function run() {
  console.log("--- Testing Deploy Invalid Bundle (Expecting 400 + Report) ---");
  try {
    const res = await post("/api/config/shell/deploy", { 
        message: "Invalid Deploy Test", 
        bundle: INVALID_BUNDLE 
    });
    
    console.log("Status:", res.status);
    
    if (res.status !== 400) {
        console.error("FAIL: Expected 400, got", res.status);
        process.exit(1);
    }
    
    if (!res.body.report) {
        console.error("FAIL: Missing validation report in response");
        process.exit(1);
    }

    const report = res.body.report;
    console.log("Severity Counts:", JSON.stringify(report.severityCounts));
    
    if (report.severityCounts.A1 < 1) {
        console.error("FAIL: Expected at least one A1 error");
        process.exit(1);
    }

    const missingBlockError = report.errors.find(e => e.code === "missing_block");
    if (missingBlockError && missingBlockError.severity === "A1") {
        console.log("PASS: Found expected A1 missing_block error.");
        console.log("Example Error:", JSON.stringify(missingBlockError, null, 2));
    } else {
        console.error("FAIL: Did not find expected missing_block A1 error.");
        console.log("Errors found:", JSON.stringify(report.errors, null, 2));
        process.exit(1);
    }

  } catch (err) {
      console.error("Test execution failed:", err);
      process.exit(1);
  }
}

run();
