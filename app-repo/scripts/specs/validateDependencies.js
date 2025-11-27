
  // scripts/specs/validateDependencies.js
  //
  // CI helper for dependency governance:
  // - Validates specs/dependencies/allowed_dependencies.json structure.
  // - Cross-checks it against specs/inventory/inventory.json layers.
  //
  // Supports two layouts:
  //  - app root = CWD (specs/** directly under cwd)
  //  - monorepo root = CWD, app under app-repo/ (specs/** under app-repo/)
  //
  // Usage (from monorepo root or app root):
  //   node app-repo/scripts/specs/validateDependencies.js
  //   or
  //   node scripts/specs/validateDependencies.js


const fs = require("fs");
const path = require("path");

function getAppRoot() {
  // Detect whether we're in a monorepo layout (app-repo subfolder) or app root.
  const cwd = process.cwd();
  const candidate = path.join(cwd, "app-repo");
  if (fs.existsSync(path.join(candidate, "specs"))) {
    return candidate;
  }
  // Fallback: assume current directory IS the app root.
  return cwd;
}

function readJSON(relPath) {
  const appRoot = getAppRoot();
  const abs = path.join(appRoot, relPath);
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

function readText(relPath) {
  const appRoot = getAppRoot();
  const abs = path.join(appRoot, relPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Missing text file: ${relPath} (expected at ${abs})`);
  }
  return fs.readFileSync(abs, "utf8");
}


  function validateAllowedDepsStructure(config) {
    const errors = [];
    const allowedLayers = ["core", "feature", "lib"];

    if (typeof config !== "object" || config === null) {
      errors.push("allowed_dependencies.json must be a JSON object at the top level.");
      return errors;
    }

    if (typeof config.version !== "number") {
      errors.push("allowed_dependencies.json must have a numeric `version` field.");
    }

    if (!Array.isArray(config.rules)) {
      errors.push("allowed_dependencies.json must have a `rules` array.");
    } else {
      config.rules.forEach((rule, idx) => {
        const prefix = `rules[${idx}]`;
        if (typeof rule !== "object" || rule === null) {
          errors.push(`${prefix} must be an object.`);
          return;
        }
        if (typeof rule.fromLayer !== "string") {
          errors.push(`${prefix}.fromLayer must be a string.`);
        } else if (!allowedLayers.includes(rule.fromLayer)) {
          errors.push(
            `${prefix}.fromLayer must be one of ${allowedLayers.join(", ")} (got: ${JSON.stringify(
              rule.fromLayer
            )})`
          );
        }
        if (!Array.isArray(rule.allowedLayers)) {
          errors.push(`${prefix}.allowedLayers must be an array of strings.`);
        } else {
          for (const layer of rule.allowedLayers) {
            if (!allowedLayers.includes(layer)) {
              errors.push(
                `${prefix}.allowedLayers contains invalid layer ${JSON.stringify(
                  layer
                )} (allowed: ${allowedLayers.join(", ")})`
              );
            }
          }
        }
      });
    }

    if (config.overrides && !Array.isArray(config.overrides)) {
      errors.push("If present, `overrides` must be an array.");
    } else if (Array.isArray(config.overrides)) {
      config.overrides.forEach((ovr, idx) => {
        const prefix = `overrides[${idx}]`;
        if (typeof ovr !== "object" || ovr === null) {
          errors.push(`${prefix} must be an object.`);
          return;
        }
        if (typeof ovr.fromName !== "string" || ovr.fromName.trim() === "") {
          errors.push(`${prefix}.fromName must be a non-empty string.`);
        }
        if (typeof ovr.toName !== "string" || ovr.toName.trim() === "") {
          errors.push(`${prefix}.toName must be a non-empty string.`);
        }
        if (ovr.reason && typeof ovr.reason !== "string") {
          errors.push(`${prefix}.reason must be a string when present.`);
        }
      });
    }

    return errors;
  }

  function checkInventoryLayers(inventory, config) {
    const errors = [];
    const allowedLayers = ["core", "feature", "lib"];

    if (!Array.isArray(inventory.items)) {
      errors.push("inventory.json: `items` must be an array.");
      return errors;
    }

    // Build quick lookup: fromLayer -> allowedLayers
    const layerRuleMap = new Map();
    for (const rule of config.rules || []) {
      if (typeof rule.fromLayer === "string" && Array.isArray(rule.allowedLayers)) {
        layerRuleMap.set(rule.fromLayer, rule.allowedLayers);
      }
    }

    // Validate all layers in inventory are known
    inventory.items.forEach((item, idx) => {
      const prefix = `inventory.items[${idx}]`;
      if (!allowedLayers.includes(item.layer)) {
        errors.push(
          `${prefix}.layer must be one of ${allowedLayers.join(", ")} (got: ${JSON.stringify(
            item.layer
          )})`
        );
      }
    });

    // Just a sanity check: every layer present in inventory should have a corresponding rule
    const layersInInventory = new Set(inventory.items.map((it) => it.layer));
    for (const layer of layersInInventory) {
      if (!layerRuleMap.has(layer)) {
        errors.push(
          `No dependency rule specified in allowed_dependencies.json for layer "${layer}" (but it is used in inventory.json).`
        );
      }
    }

    return errors;
  }

  function main() {
    const errors = [];

    let inv;
    let depsConfig;

    try {
      inv = readJSON("specs/inventory/inventory.json");
    } catch (err) {
      console.error("[deps] " + err.message);
      process.exitCode = 1;
      return;
    }

    try {
      depsConfig = readJSON("specs/dependencies/allowed_dependencies.json");
    } catch (err) {
      console.error("[deps] " + err.message);
      process.exitCode = 1;
      return;
    }

    errors.push(...validateAllowedDepsStructure(depsConfig));
    errors.push(...checkInventoryLayers(inv, depsConfig));

    if (errors.length > 0) {
      console.error("❌ Dependency config validation failed with the following errors:");
      for (const err of errors) {
        console.error("  - " + err);
      }
      console.error(
        "\nNote: This validator currently checks only the *configuration* (layers and rules)." +
          "\n      You can later extend it to analyze actual imports and flag real dependency edges."
      );
      process.exitCode = 1;
    } else {
      console.log("✅ Dependency configuration validation passed.");
      console.log(
        "   (Structural only: inventory layers and allowed_dependencies rules look consistent.)"
      );
    }
  }

  if (require.main === module) {
    main();
  }
