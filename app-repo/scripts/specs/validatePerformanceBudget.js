
// scripts/specs/validatePerformanceBudget.js
//
// CI helper for performance budget governance:
// - Validates specs/perf/performance_budget.json structure.
// - Cross-checks moduleBudgets entries against specs/inventory/inventory.json.
//
// Usage (from repo root):
//   node scripts/specs/validatePerformanceBudget.js
//
// Recommended package.json script:
//   "spec:check:perf": "node scripts/specs/validatePerformanceBudget.js"

const fs = require("fs");
const path = require("path");

function readJSON(relPath) {
  const abs = path.join(process.cwd(), relPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Missing JSON file: ${relPath} (expected at ${abs})`);
  }
  const raw = fs.readFileSync(abs, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse JSON at ${relPath}: ${err.message}`);
  }
}

function validatePerfStructure(perf) {
  const errors = [];
  const allowedLayers = ["core", "feature", "lib"];

  if (typeof perf !== "object" || perf === null) {
    errors.push("performance_budget.json must be a JSON object at the top level.");
    return errors;
  }

  if (typeof perf.version !== "number") {
    errors.push("performance_budget.json must have a numeric `version` field.");
  }

  if (perf.globalBudgets && typeof perf.globalBudgets !== "object") {
    errors.push("`globalBudgets` must be an object when present.");
  } else if (perf.globalBudgets) {
    for (const [key, value] of Object.entries(perf.globalBudgets)) {
      if (typeof value !== "number") {
        errors.push(
          `globalBudgets.${key} must be a number (ms) but got: ${JSON.stringify(value)}`
        );
      }
    }
  }

  if (!Array.isArray(perf.moduleBudgets)) {
    errors.push("`moduleBudgets` must be an array.");
    return errors;
  }

  perf.moduleBudgets.forEach((mb, idx) => {
    const prefix = `moduleBudgets[${idx}]`;
    if (typeof mb !== "object" || mb === null) {
      errors.push(`${prefix} must be an object.`);
      return;
    }

    if (typeof mb.name !== "string" || mb.name.trim() === "") {
      errors.push(`${prefix}.name must be a non-empty string.`);
    }

    if (typeof mb.layer !== "string" || !allowedLayers.includes(mb.layer)) {
      errors.push(
        `${prefix}.layer must be one of ${allowedLayers.join(", ")} (got: ${JSON.stringify(
          mb.layer
        )})`
      );
    }

    if (typeof mb.budgets !== "object" || mb.budgets === null) {
      errors.push(`${prefix}.budgets must be an object.`);
    } else {
      for (const [metric, value] of Object.entries(mb.budgets)) {
        if (typeof value !== "number") {
          errors.push(
            `${prefix}.budgets.${metric} must be a number (ms) but got: ${JSON.stringify(value)}`
          );
        }
      }
    }

    if ("notes" in mb && typeof mb.notes !== "string") {
      errors.push(`${prefix}.notes must be a string when present.`);
    }
  });

  return errors;
}

function crossCheckWithInventory(perf, inventory) {
  const errors = [];

  if (!Array.isArray(inventory.items)) {
    errors.push("inventory.json: `items` must be an array.");
    return errors;
  }

  const nameToLayer = new Map();
  inventory.items.forEach((item) => {
    if (typeof item.name === "string" && typeof item.layer === "string") {
      nameToLayer.set(item.name, item.layer);
    }
  });

  perf.moduleBudgets.forEach((mb, idx) => {
    const prefix = `moduleBudgets[${idx}]`;
    const invLayer = nameToLayer.get(mb.name);
    if (!invLayer) {
      errors.push(
        `${prefix}.name=${JSON.stringify(
          mb.name
        )} does not exist in specs/inventory/inventory.json`
      );
    } else if (invLayer !== mb.layer) {
      errors.push(
        `${prefix}.layer=${JSON.stringify(
          mb.layer
        )} does not match inventory layer=${JSON.stringify(invLayer)} for name=${
          mb.name
        }`
      );
    }
  });

  return errors;
}

function main() {
  const errors = [];

  let perf;
  let inventory;

  try {
    perf = readJSON("specs/perf/performance_budget.json");
  } catch (err) {
    console.error("[perf] " + err.message);
    process.exitCode = 1;
    return;
  }

  try {
    inventory = readJSON("specs/inventory/inventory.json");
  } catch (err) {
    console.error("[perf] " + err.message);
    process.exitCode = 1;
    return;
  }

  errors.push(...validatePerfStructure(perf));
  errors.push(...crossCheckWithInventory(perf, inventory));

  if (errors.length > 0) {
    console.error("❌ Performance budget validation failed with the following errors:");
    for (const err of errors) {
      console.error("  - " + err);
    }
    console.error(
      "\nNote: This validator currently checks only the *configuration* (structure + inventory alignment)."
    );
    process.exitCode = 1;
  } else {
    console.log("✅ Performance budget validation passed.");
    console.log(
      "   (Structural only: performance_budget.json is well-formed and aligned with inventory.json.)"
    );
  }
}

if (require.main === module) {
  main();
}
