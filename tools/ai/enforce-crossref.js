#!/usr/bin/env node

/**
 * enforce-crossref.js (placeholder)
 *
 * This script is executed by GitHub Actions as part of the "Validate cross-reference"
 * workflow. For now it simply checks that all required files exist and prints a
 * success message.
 *
 * Later, this script will:
 *   - validate ai-library-index.json
 *   - validate destructive-change.json (when present)
 *   - validate block/module crossrefs
 *   - enforce no duplicated core utilities
 *   - enforce architectural boundaries
 */

const fs = require("fs");
const path = require("path");

function fileExists(p) {
  return fs.existsSync(path.resolve(p));
}

console.log("🔍 FOLE Crossref Validator (placeholder)");

// -------------------------------------------------------------
// Check required AI files exist so CI doesn't run on empty repo
// -------------------------------------------------------------

const required = [
  "app-repo/docs/ai/_AI_MASTER_RULES.md",
];

let missing = [];

for (const file of required) {
  if (!fileExists(file)) missing.push(file);
}

if (missing.length > 0) {
  console.error("❌ Missing required AI documentation files:");
  missing.forEach(f => console.error("  - " + f));
  process.exit(1);
}

console.log("✅ Required AI files found.");
console.log("⚠️ Note: Full crossref enforcement not yet implemented.");

process.exit(0);
