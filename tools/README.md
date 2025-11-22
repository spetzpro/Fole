# Tools

## Purpose

The `tools/` directory contains **developer and CI tooling only**.  
Nothing here is required for the runtime behavior of the FOLE application.

Typical responsibilities:

- JSON Schema validation (e.g. destructive changes, AI action logs)
- Cross-reference and metadata checks
- Future AI-enforcement scripts

These tools are used primarily by **GitHub Actions** and local developer checks.

---

## Node.js Dependencies

Node.js is used as a **tooling runtime**, not as the core backend.

Installed packages (see `package.json`) are:

- Dev-only dependencies
- Used in CI jobs to:
  - Validate JSON files against schemas
  - Enforce repository rules and conventions

It is **normal** for `npm install` to print warnings such as:

- Deprecated transitive dependencies
- High-severity vulnerabilities in dev-only libs (e.g. `glob`, `inflight`)

Because:

- These packages never run in production
- They do not handle user data
- They are only used during CI or local validation

### Important:

- Do **not** run: `npm audit fix --force`  
  That can break CI tools by upgrading them across major versions.

- OK to run:
  - `npm install`
  - `npm audit` (for inspection only)

---

## Summary

- `tools/` = CI + dev helpers, not app runtime
- Node warnings are expected and safe in this context
- Do not auto-fix dev-only dependency vulnerabilities
- Core application logic lives under `app-repo/`
