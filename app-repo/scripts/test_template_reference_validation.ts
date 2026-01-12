import { ShellConfigValidator } from "../src/server/ShellConfigValidator";
import * as path from "path";

const repoRoot = path.join(__dirname, "../../");
const validator = new ShellConfigValidator(repoRoot);

async function runTests() {
  console.log("Starting Template Reference Validation Tests...");

  const minimalManifest = {
      bundleId: "test-bundle",
      version: "1.0.0",
      schemaVersion: "1.0.0",
      createdAt: new Date().toISOString(),
      regions: { top: {}, bottom: {}, main: {} }
  };

  // 1. Template referencing missing block
  const invalidBundle = {
    manifest: minimalManifest,
    blocks: {
      "template_missing_refs": {
        blockId: "template_missing_refs",
        blockType: "template",
        schemaVersion: "1.0.0",
        data: {
          label: "Template with Missing Refs",
          enabled: true,
          surfaces: [],
          tools: [],
          windows: ["missing_window_id"] // This block doesn't exist
        }
      }
    }
  };

  const report = await validator.validateBundle(invalidBundle as any);
  
  // Filter for our specific error code and block
  const refErrors = report.errors.filter(e => 
      e.code === "template_missing_reference" && 
      e.blockId === "template_missing_refs"
  );
  
  if (refErrors.length > 0) {
    console.log("✅ Template Missing Reference caught correctly (A1).");
    console.log("Example Error Object:", JSON.stringify(refErrors[0], null, 2));
  } else {
    // If it failed to catch, let's see what errors we DID get (excluding common manifest ones if possible)
    const otherErrors = report.errors.filter(e => e.blockId === "template_missing_refs");
    console.error("❌ Template Missing Reference NOT caught.");
    console.error("Relevant Errors found:", JSON.stringify(otherErrors, null, 2));
    process.exit(1);
  }

  console.log("\nAll Template Reference Tests Passed!");
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
