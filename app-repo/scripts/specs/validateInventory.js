
  // scripts/specs/validateInventory.js
  //
  // CI helper: validates specs/inventory/inventory.json against
  // simple structural rules + allowed enums, and cross-checks it
  // with specs/Blocks_Modules_Inventory.md.
  //
  // Supports two layouts:
  //  - app root = CWD (specs/** directly under cwd)
  //  - monorepo root = CWD, app under app-repo/ (specs/** under app-repo/)
  //
  // Usage (from monorepo root or app root):
  //   node app-repo/scripts/specs/validateInventory.js
  //   or
  //   node scripts/specs/validateInventory.js
  //
  // Recommended package.json script at monorepo root:
  //   "spec:check:inventory": "node app-repo/scripts/specs/validateInventory.js"


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


  function validateInventoryStructure(inv) {
    const errors = [];

    const allowedKinds = ["Block", "Module", "Lib"];
    const allowedLayers = ["core", "feature", "lib"];
    const allowedStatuses = [
      "Planned",
      "Specced",
      "In implementation",
      "Implemented",
      "Stable",
    ];
    const allowedProps = ["name", "kind", "layer", "status", "specPath", "notes"];

    if (typeof inv !== "object" || inv === null) {
      errors.push("inventory.json must be a JSON object at the top level.");
      return errors;
    }

    if (typeof inv.version !== "number") {
      errors.push("inventory.json must have a numeric `version` field.");
    }

    if (!Array.isArray(inv.items)) {
      errors.push("inventory.json must have an `items` array.");
      return errors;
    }

    inv.items.forEach((item, idx) => {
      const prefix = `items[${idx}]`;

      if (typeof item !== "object" || item === null) {
        errors.push(`${prefix} must be an object.`);
        return;
      }

      const required = ["name", "kind", "layer", "status"];
      required.forEach((key) => {
        if (!(key in item)) {
          errors.push(`${prefix} is missing required field \`${key}\`.`);
        }
      });

      if (typeof item.name !== "string" || item.name.trim() === "") {
        errors.push(`${prefix}.name must be a non-empty string.`);
      }

      if (!allowedKinds.includes(item.kind)) {
        errors.push(
          `${prefix}.kind must be one of ${allowedKinds.join(
            ", "
          )} (got: ${JSON.stringify(item.kind)})`
        );
      }

      if (!allowedLayers.includes(item.layer)) {
        errors.push(
          `${prefix}.layer must be one of ${allowedLayers.join(
            ", "
          )} (got: ${JSON.stringify(item.layer)})`
        );
      }

      if (!allowedStatuses.includes(item.status)) {
        errors.push(
          `${prefix}.status must be one of ${allowedStatuses.join(
            ", "
          )} (got: ${JSON.stringify(item.status)})`
        );
      }

      if ("specPath" in item && typeof item.specPath !== "string") {
        errors.push(`${prefix}.specPath must be a string when present.`);
      }

      if ("notes" in item && typeof item.notes !== "string") {
        errors.push(`${prefix}.notes must be a string when present.`);
      }

      const extra = Object.keys(item).filter((k) => !allowedProps.includes(k));
      if (extra.length > 0) {
        errors.push(
          `${prefix} has unexpected properties: ${extra
            .map((x) => "`" + x + "`")
            .join(", ")}`
        );
      }
    });

    return errors;
  }

  function parseMarkdownInventory(md) {
    const combos = new Set();
    const lines = md.split(/\r?\n/);

    let inTable = false;
    let headerCols = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed.startsWith("|")) {
        inTable = false;
        headerCols = null;
        continue;
      }

      // Header row
      if (trimmed.startsWith("| Name ") || trimmed.startsWith("| Name|")) {
        inTable = true;
        const cols = trimmed
          .split("|")
          .slice(1, -1)
          .map((c) => c.trim());
        headerCols = cols;
        continue;
      }

      // Separator row (----)
      if (inTable && trimmed.includes("---")) {
        continue;
      }

      // Data row
      if (inTable && headerCols) {
        const cols = trimmed
          .split("|")
          .slice(1, -1)
          .map((c) => c.trim());

        if (cols.length !== headerCols.length) {
          // Probably not a real row
          continue;
        }

        const idxName = headerCols.indexOf("Name");
        const idxKind = headerCols.indexOf("Kind");
        const idxLayer = headerCols.indexOf("Layer");

        if (idxName === -1 || idxKind === -1 || idxLayer === -1) {
          continue;
        }

        const name = cols[idxName];
        const kind = cols[idxKind];
        const layer = cols[idxLayer];

        if (name && kind && layer) {
          combos.add(`${name}|${kind}|${layer}`);
        }
      }
    }

    return combos;
  }

  function crossCheckWithMarkdown(inv, mdText) {
    const errors = [];

    const mdCombos = parseMarkdownInventory(mdText);
    if (mdCombos.size === 0) {
      console.warn(
        "[inventory] Warning: could not extract any rows from Blocks_Modules_Inventory.md; " +
          "skipping cross-check. Check table formatting if this is unexpected."
      );
      return errors;
    }

    const jsonCombos = new Set();
    inv.items.forEach((item) => {
      const combo = `${item.name}|${item.kind}|${item.layer}`;
      jsonCombos.add(combo);
    });

    // JSON → Markdown
    for (const combo of jsonCombos) {
      if (!mdCombos.has(combo)) {
        errors.push(
          `JSON inventory entry ${combo} not found in Blocks_Modules_Inventory.md`
        );
      }
    }

    // Markdown → JSON
    for (const combo of mdCombos) {
      if (!jsonCombos.has(combo)) {
        errors.push(
          `Blocks_Modules_Inventory.md row ${combo} not found in inventory.json`
        );
      }
    }

    return errors;
  }

  function main() {
    const errors = [];

    let inventoryJson;
    let markdown;

    try {
      inventoryJson = readJSON("specs/inventory/inventory.json");
    } catch (err) {
      console.error("[inventory] " + err.message);
      process.exitCode = 1;
      return;
    }

    try {
      markdown = readText("specs/Blocks_Modules_Inventory.md");
    } catch (err) {
      console.error("[inventory] " + err.message);
      process.exitCode = 1;
      return;
    }

    errors.push(...validateInventoryStructure(inventoryJson));
    errors.push(...crossCheckWithMarkdown(inventoryJson, markdown));

    if (errors.length > 0) {
      console.error("❌ Inventory validation failed with the following errors:");
      for (const err of errors) {
        console.error("  - " + err);
      }
      process.exitCode = 1;
    } else {
      console.log("✅ Inventory validation passed.");
    }
  }

  if (require.main === module) {
    main();
  }
