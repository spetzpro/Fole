# FOLE

FOLE is a modular, map-centric web application designed to handle everything from
floor plans and factories to terrain and globe-scale views, with millimeter-level
precision and strong AI-assisted development rules.

This repository is split into two main concerns:

- **Code & specs** (version controlled)  
- **Runtime data** (under `STORAGE_ROOT`, usually outside the repo or in a dedicated hidden folder)

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

-- `localstorage/` (ignored by Git)  
  Default local runtime storage root (`STORAGE_ROOT` in development runs and AI/VS Code automation).  
  Contains databases, tiles, uploads, logs, etc. **Never committed. Not used as the app’s canonical STORAGE_ROOT.**

- `node_modules/` (ignored by Git)  
  Local Node.js dependencies used **only for CI / validation tooling**, not for the
  runtime application.

---

## Storage Root

By default in development:

- `STORAGE_ROOT = ./localstorage`

This directory contains **all runtime data for local dev and automation runs**:

- Core DBs
- Project DBs
- Map DBs
- Tiles, uploads, exports
- Job/operation logs

It is safe to back up or move `STORAGE_ROOT` independently from the code.

When the application uses a storage directory **inside this repository**, the canonical in-repo storage root MUST be:

- `STORAGE_ROOT = app-repo/.storage/`

The `.storage/` directory is a hidden, non-source folder intended only for persistent runtime data and is ignored by Git.

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

## Contributor Workflow & Spec Alignment Overview

FOLE is developed using a **specification-first workflow**. Specs describe the
target behavior; the code and tests must stay aligned with those specs; and
an inventory tracks which modules and blocks are actually implemented.

At a high level:

- **Specs are authoritative**  
  Every core system, module, and block has a spec under `app-repo/specs/`.
  When behavior changes at a public surface (API, schema, permissions, UX),
  the spec must be updated first or alongside the change.

- **Inventory tracks implementation status**  
  The module/block inventory file records which parts of the system are
  Planned, Specced, InImplementation, or Implemented, and where their specs
  live:
  - `app-repo/specs/Blocks_Modules_Inventory.md`

- **Changes are grouped into tiers**  
  The workflow distinguishes between:
  - **L1** – minor/internal changes with no external contract change
  - **L2** – changes to APIs, schemas, permissions, or visible UX behavior
  - **L3** – new modules, deprecations, or cross-module contract changes

  Higher tiers require stricter steps (spec + inventory updates, sitreps,
  and approvals); the details are defined in the workflow guide.

- **Architecture rules live in one place**  
  System-wide principles and non‑negotiable rules (atomicity, security,
  spec‑first, drift prevention) are defined in `_AI_MASTER_RULES.md` and
  apply across the entire repo.

For full details (tier rules, responsibilities, and examples), see:

- `app-repo/specs/Spec_Workflow_Guide.md`
- `app-repo/docs/ai/_AI_MASTER_RULES.md`

---

## Forking & Governance in Forks

If you fork this repository:

- You effectively become the **architecture owner of your fork**.  
  CODEOWNERS entries that reference teams or users that don't exist in your
  fork will simply not apply.

- The governance system is **opt‑in** at the CI level.  
  The specs and workflow guide still describe how FOLE is intended to be
  evolved, but CI enforcement (spec checks, inventory validation, etc.) only
  runs if you enable GitHub Actions and keep the workflows.

- Your fork will still work without strict governance.  
  You can ignore the workflow guide, change specs freely, or skip updating
  the inventory—but you will lose the drift protection and guarantees that
  the main repo aims to enforce.

If you want your fork to behave like the main governed repo:

- Enable the CI workflows under `.github/workflows/`
- Keep or adapt `CODEOWNERS` to your own users/teams
- Follow `app-repo/specs/Spec_Workflow_Guide.md` for all L2/L3 changes

When contributing changes back upstream, the **upstream** repo’s rules always
apply: specs and inventory must be aligned, and higher‑tier changes require
the appropriate approvals.

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
