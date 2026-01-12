import { ShellConfigValidator } from "../src/server/ShellConfigValidator";
import * as path from "path";

const repoRoot = path.join(__dirname, "../../");
const validator = new ShellConfigValidator(repoRoot);

async function runTests() {
  console.log("Starting Template Schema Validation Tests...");

  const minimalManifest = {
      bundleId: "test-bundle",
      version: "1.0.0",
      schemaVersion: "1.0.0",
      createdAt: new Date().toISOString(),
      regions: { top: {}, bottom: {}, main: {} } // Still likely invalid but we ignore manifest errors
  };

  // 1. Valid Template
  const validBundle = {
    manifest: minimalManifest,
    blocks: {
      "template_valid": {
        blockId: "template_valid",
        blockType: "template",
        schemaVersion: "1.0.0",
        data: {
          label: "Valid Template",
          enabled: true,
          surfaces: ["surf_1"],
          tools: ["tool_1"],
          windows: ["win_1"]
        }
      }
    }
  };

  const report1 = await validator.validateBundle(validBundle as any);
  // Filter for errors related to our block
  const validBlockErrors = report1.errors.filter(e => e.path && e.path.includes("template_valid"));
  
  if (validBlockErrors.length === 0) {
    console.log(" Valid Template passed (ignoring unrelated manifest errors).");
  } else {
    console.error(" Valid Template failed:", JSON.stringify(validBlockErrors, null, 2));
    process.exit(1);
  }

  // 2. Invalid Template (Missing Label)
  const invalidBundleMissingLabel = {
      manifest: minimalManifest,
      blocks: {
        "template_no_label": {
          blockId: "template_no_label",
          blockType: "template",
          schemaVersion: "1.0.0",
          data: {
            // label missing
            enabled: true
          }
        }
      }
    };
  
    const report2 = await validator.validateBundle(invalidBundleMissingLabel as any);
    const hasLabelError = report2.errors.some(e => 
        e.message.includes("must have required property 'label'") && 
        e.path && e.path.includes("template_no_label")
    );
    
    if (hasLabelError) {
      console.log(" Missing Label caught correctly (A1).");
      // Find the specific error to log
      const err = report2.errors.find(e => e.message.includes("must have required property 'label'"));
      console.log("Example Error Object:", JSON.stringify(err, null, 2));
    } else {
      console.error(" Missing Label NOT caught:", JSON.stringify(report2.errors, null, 2));
      process.exit(1);
    }

  // 3. Invalid Template (Window is not a string)
  const invalidBundleBadType = {
      manifest: minimalManifest,
      blocks: {
        "template_bad_window": {
          blockId: "template_bad_window",
          blockType: "template",
          schemaVersion: "1.0.0",
          data: {
            label: "Bad Window Type",
            enabled: true,
            windows: [ 123 ] // Should be string
          }
        }
      }
    };

    const report3 = await validator.validateBundle(invalidBundleBadType as any);
    const hasTypeError = report3.errors.some(e => 
        e.message.includes("must be string") && 
        e.path && e.path.includes("template_bad_window")
    );

    if (hasTypeError) {
        console.log(" Invalid Property Type caught correctly (A1).");
    } else {
        console.error(" Invalid Property Type NOT caught:", JSON.stringify(report3.errors, null, 2));
        process.exit(1);
    }

    console.log("\nAll Template Schema Tests Passed!");
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
