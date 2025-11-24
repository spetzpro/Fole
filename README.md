# FOLE

FOLE is a modular, map-centric web application designed to handle everything from
floor plans and factories to terrain and globe-scale views, with millimeter-level
precision and strong AI-assisted development rules.

This repository is split into two main concerns:

- **Code & specs** (version controlled)  
- **Runtime data** (outside the repo, under `STORAGE_ROOT`)

---

## Repository Layout

Top-level structure:

- `app-repo/`  
  Source-controlled application code and documentation:
  - `docs/` – high-level and AI-specific documentation  
    - `ai/` – AI guidance files (e.g. `_AI_MASTER_RULES.md`, context maps, etc.)
  - `specs/` – system specifications
    - `core/` – core system specs (storage, permissions, jobs, etc.)
    - `modules/` – module-level specs (projects, maps, etc.)
    - `blocks/` – block-level specs (renderer, tiler, calibration, etc.)

- `.github/workflows/`  
  CI workflows that validate JSON schemas, cross-references, and basic hygiene.

- `tools/`  
  Developer and CI tooling (Node-based validators, schemas, enforcement scripts).

- `localstorage/` (ignored by Git)  
  Default local runtime storage root (`STORAGE_ROOT` in development).  
  Contains databases, tiles, uploads, logs, etc. **Never committed.**

- `node_modules/` (ignored by Git)  
  Local Node.js dependencies used **only for CI / validation tooling**, not for the
  runtime application.

---

## Storage Root

By default in development:

- `STORAGE_ROOT = ./localstorage`

This directory contains **all runtime data**:

- Core DBs
- Project DBs
- Map DBs
- Tiles, uploads, exports
- Job/operation logs

It is safe to back up or move `STORAGE_ROOT` independently from the code.

---

## AI Governance & Rules

The AI development workflow is governed by:

- `app-repo/docs/ai/_AI_MASTER_RULES.md`

This file defines:

- What AI agents are allowed to change
- When human approval is required
- How destructive changes are described and validated
- How context and specs must be loaded

Additional AI-facing documents (context maps, module/block standards, etc.)
live under:

- `app-repo/docs/ai/`
- `app-repo/specs/core/`
- `app-repo/specs/modules/`
- `app-repo/specs/blocks/`

---

## Tools & CI

Node.js is used **only** as a tooling runtime:

- JSON Schema validation (via `ajv-cli`)
- Cross-reference checks
- Future AI enforcement scripts

These tools are configured via:

- `package.json`
- `tools/ai/*.json` – JSON schemas
- `.github/workflows/*.yml` – CI workflows

They do **not** run in production and do not handle user data directly.

---

## Status

This repository is in the early scaffolding phase:

- Core rules and AI governance: defined
- Storage and structure specs: in progress
- Modules and blocks: to be added step-by-step with accompanying specs

For details on the application core, concurrency model, and developer-focused roadmap, see:

- `app-repo/README.md`
- `app-repo/specs/core/_AI_CORE_BUILD_ROADMAP.md`
