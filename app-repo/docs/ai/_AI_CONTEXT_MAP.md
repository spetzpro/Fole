# Version: SPEC_V1.0  
Last-Updated: 2025-11-23  

# _AI_CONTEXT_MAP.md  
**AI Context Routing & Loading Rules**

Document-Version: 1.0.1  
Last-Updated: 2025-11-23  

ai-docs-index-path: `app-repo/docs/ai/ai-docs-index.json`  
ai-context-routing-path: `app-repo/docs/ai/ai-context-routing.json`  

---

## 0. Canonical Paths (Single Source of Truth)

These are the **only** canonical locations for AI governance and routing docs:

- `_AI_MASTER_RULES.md`  
  → `app-repo/docs/ai/_AI_MASTER_RULES.md`

- `_AI_DOCS_OVERVIEW.md`  
  → `app-repo/docs/ai/_AI_DOCS_OVERVIEW.md`

- `_AI_CONTEXT_MAP.md` (this file)  
  → `app-repo/docs/ai/_AI_CONTEXT_MAP.md`

- `ai-docs-index.json` (machine-readable doc index)  
  → `app-repo/docs/ai/ai-docs-index.json`

- `ai-context-routing.json` (machine-readable routing helper)  
  → `app-repo/docs/ai/ai-context-routing.json`

- Destructive change schema  
  → `tools/ai/destructive-change-schema.json`

- Destructive change metadata (per PR)  
  → `destructive-change.json` at **repo root**

- AI automation pause flag (per server)  
  → `<STORAGE_ROOT>/AI_AUTOMATION_PAUSED`

- `specs/libs/` — shared helper / library specifications.  
  Contains promoted helpers used by multiple modules/blocks. Helpers start life as local (inside modules/blocks). They may be promoted into this folder **only** when shared usage is confirmed AND a human approves the promotion.

If a future document moves, **this table MUST be updated** in the same PR.

---

## 1. Purpose

This file tells AI agents **what to load and when**.

It implements the **Minimal Context Principle** from `_AI_MASTER_RULES.md`:

> “Load only what you need to do this task safely and correctly.  
>  When in doubt, STOP and ask.”

This document is the **authoritative routing spec**.  
JSON helpers (like `ai-docs-index.json` and `ai-context-routing.json`) exist to speed things up, but **Markdown specs always win** if there is any conflict.

All AI-governed specs and templates currently follow `SPEC_V1.x`. See `_AI_MASTER_RULES.md` for version precedence, STOP rules, and spec interpretation.

See `_AI_MASTER_RULES.md` for the full spec precedence hierarchy (core specs → modules → libs → blocks).

---

## 1.2 Context Hierarchy (Load Order)

Agents **must** load files in this order:

1. `_AI_MASTER_RULES.md` (Constitution)  
2. `_AI_DOCS_OVERVIEW.md` (Sitemap / what exists)  
3. `_AI_CONTEXT_MAP.md` (this file – routing logic)  
4. The specific specs listed for the current task (relevant `_AI_*.md` in `specs/core`, `specs/modules`, `specs/blocks`, etc.)  
5. The relevant block/module crossref file(s), if the task touches a specific block.
 6. Any shared helper/library specifications under `specs/libs/` that are used by the code being modified (promoted shared helpers only; local helpers remain implementation details and are not spec'd).

JSON files:

- `ai-docs-index.json`
- `ai-context-routing.json`

…are **internal helpers** for steps 3–4.  
They **never override** what this file or `_AI_MASTER_RULES.md` say.

---

## 2. Global Rules for Context Loading

### 2.1 Minimal Context Principle (MCP)

- Load the **smallest possible set** of documents to do the job safely.
- Prefer **one or two core specs**, plus one **block- or module-specific spec**.
- If you think you need “everything”, you’re probably routing incorrectly → **STOP and ask the user**.

### 2.2 STOP Rules (Never Guess)

An agent **must immediately STOP and ask the user** if:

1. There is **no matching routing rule** for the task/path.
2. A required spec file listed here is:
   - missing,
   - empty,
   - clearly placeholder text, or
   - obviously inconsistent (e.g., “TODO: fill later” as main content).
3. The same task appears to match **multiple contradictory routing rules**.
4. The AI_AUTOMATION_PAUSED flag exists at `<STORAGE_ROOT>/AI_AUTOMATION_PAUSED`.

In these cases, do **not** improvise.  
Ask the user which spec to treat as authoritative or whether to create/update one.

### 2.3 Markdown vs JSON Priority

If Markdown rules and JSON helpers disagree:

- **Markdown wins.**
- Consider JSON out-of-date and either:
  - update the JSON to match Markdown, or
  - stop and ask for clarification.

### 2.4 Automation Pause

If `<STORAGE_ROOT>/AI_AUTOMATION_PAUSED` exists:

- Agents must **not** perform automated changes (no migrations, no file writes, no schema edits, no storage changes).
- Read-only analysis is allowed.
- CI jobs that run AI-driven workflows must **refuse to proceed**.

---

## 3. Task Classification (High-Level)

Before loading detailed specs, an agent must classify what it is doing.

At minimum, decide which of these categories applies:

- **CORE Infra / Storage / Jobs**
- **UI / Windows / Viewer behavior**
- **Roles & Permissions / ACL**
- **Geo / Calibration / Coordinates**
- **Files / Images / Map Tiles**
- **Project / Module / Block Implementation**
- **Destructive Change (schema, data, storage layout)**

Once classified, use the routing table in Section 4.

If the task spans multiple domains (e.g., “add a new viewer that uses map tiles and sketches”), load the **union** of relevant specs, but still keep context **as small as possible**.

---

## 4. Routing Table (What to Load for What)

For each domain or path, this section lists the **required specs**.  
In all cases, the base context is:

- `_AI_MASTER_RULES.md`
- `_AI_DOCS_OVERVIEW.md`
- `_AI_CONTEXT_MAP.md` (this file)

Those three are implied **always** and not repeated below.

### 4.1 CORE / Storage / Runtime Layout

**When:**

- You touch `STORAGE_ROOT`, `localstorage/`, or storage paths in code.
- You modify backup/restore logic.
- You add/change runtime folder layout.

**Also load:**

- `specs/core/_AI_STORAGE_ARCHITECTURE.md`
- `specs/core/_AI_TEMPLATES_AND_DEFAULTS.md` (for defaults that may live in storage)
- `specs/core/_AI_OPERATIONS_AND_JOB_SYSTEM.md` (if storage change interacts with long-running jobs)

If `_AI_STORAGE_ARCHITECTURE.md` is missing or empty → **STOP and ask.**

---

### 4.2 UI / Windows / Viewer Behavior

**When:**

- You modify anything in the UI layout, windows, toolbars, viewers, selection, undo/redo.
- You touch window types or viewer functionality.

**Also load:**

- `specs/core/_AI_UI_SYSTEM_SPEC.md`
- `specs/core/_AI_TEMPLATES_AND_DEFAULTS.md` (for UI templates and defaults)

If `_AI_UI_SYSTEM_SPEC.md` is missing or empty → **STOP and ask.**

---

### 4.3 Roles, Permissions, ACL, and Weights

**When:**

- You modify role definitions, weights, permissions matrices, or enforcement.
- You touch any “who can do what” logic in code.
- You work on templates for roles/permissions.

**Also load:**

- `specs/core/_AI_ROLES_AND_PERMISSIONS.md`
- `specs/core/_AI_TEMPLATES_AND_DEFAULTS.md` (for default roles/permission templates)

Enforcement rule:  
If code allows something the spec says is forbidden, or vice versa, AI must **flag a spec violation** and either:

- update code to match spec, or
- stop and ask whether spec should be updated (with human approval).

---

### 4.4 Geo / Calibration / Coordinates

**When:**

- You handle GPS, WGS84, ENU, floorplan calibration, map anchors, or location identifiers.
- You work on unplaced maps, recalibration, or geospatial math.

**Also load:**

- `specs/core/_AI_GEO_AND_CALIBRATION_SPEC.md`
- `specs/core/_AI_STORAGE_ARCHITECTURE.md` (for where calibrated data lives)
- `specs/core/_AI_OPERATIONS_AND_JOB_SYSTEM.md` (if recalibration triggers big background jobs)

If `_AI_GEO_AND_CALIBRATION_SPEC.md` is missing or empty → **STOP and ask.**

---

### 4.5 Operations / Job System / Long-Running Tasks

**When:**

- You add or alter any background job, tiling process, recalculation, migration, export, or batch operation.
- You touch job progress reporting, cancellation, or queueing.

**Also load:**

- `specs/core/_AI_OPERATIONS_AND_JOB_SYSTEM.md`
- `specs/core/_AI_STORAGE_ARCHITECTURE.md` (for where job metadata is stored)

All jobs that touch storage **must** follow the atomic write pattern defined in storage spec.

---

### 4.6 File / Image / Map Tile Handling

**When:**

- You touch image import, map images, tiled rendering, thumbnails, or upload flows.
- You modify any PDF/PSD rasterization or tile-generation operation.

**Also load:**

- `specs/core/_AI_FILE_AND_IMAGE_PIPELINE_SPEC.md`
- `specs/core/_AI_STORAGE_ARCHITECTURE.md` (for where assets/tiles go)
- `specs/core/_AI_OPERATIONS_AND_JOB_SYSTEM.md` (if tiling is job-based)

Rasterization and tile generation must respect the **sandboxing and atomic write** rules in those specs.

---

### 4.7 Modules & Blocks (Implementation-Level Work)

**When:**

- You modify or create code inside `modules/` or `app-repo/specs/blocks/`.
- You implement or refactor a specific block’s logic.

**Also load:**

1. The **block spec**:

   - `app-repo/specs/blocks/<blockName>/<blockName>_SPEC.md`  
     (exact naming can be refined later, but MUST be consistent)

2. The **block crossref**:

   - `app-repo/specs/blocks/<blockName>/crossref/ai-library-index.json`  
     (machine-readable “what this block exposes / depends on”)

3. Any module-level spec:

   - `app-repo/specs/modules/<moduleName>/<moduleName>_SPEC.md` (if it exists)

**STOP rule**:  
If the block spec or crossref is missing or obviously stubbed:

- **Do not** invent it quietly.
- Ask the user: “Should I create the block spec and crossref now?” and follow instructions.

---

### 4.8 Templates & Defaults

**When:**

- You define new templates or defaults for roles, sketch features, map categories, etc.
- You alter behavior that affects "factory defaults" vs "server defaults" vs "project overrides".

**Also load:**

- `specs/core/_AI_TEMPLATES_AND_DEFAULTS.md`
- `specs/core/_AI_STORAGE_ARCHITECTURE.md` (for where server defaults live)
- `specs/core/_AI_ROLES_AND_PERMISSIONS.md` (if templates relate to roles/ACL)

Templates **must** honor the resolution order:  
Project override → Server default → Factory default → Hardcoded fallback.

---

### 4.9 Destructive Changes (Schema / Data / Layout)

**When:**

- You change DB schema (tables/columns/indexes).
- You change storage layout (folder structure or file naming semantics).
- You write code that can delete or bulk-mutate data.
- You alter calibration behavior in a way that **moves or recomputes** existing data.

**Also load:**

- `_AI_MASTER_RULES.md` (destructive governance section)
- `specs/core/_AI_STORAGE_ARCHITECTURE.md`
- `specs/core/_AI_OPERATIONS_AND_JOB_SYSTEM.md`
- Any relevant module/block specs involved.

**Additionally**, you MUST:

1. Create or update `destructive-change.json` at repo root.  
   - Must conform to `tools/destructive-change-schema.json`.
   - Must describe **type, scope, rationale, mitigation, rollback**.
2. Ensure that required human approvals and PR labeling rules (from `_AI_MASTER_RULES.md`) are followed.
3. Assume CI will refuse to merge unless:
   - `destructive-change.json` validates against schema, and
   - Required human approvals are present.

No destructive change may bypass this flow.

---

## 5. Machine-Readable Helpers (JSON)

### 5.1 ai-docs-index.json

Path: `app-repo/docs/ai/ai-docs-index.json`

Purpose:

- Quick discovery of:
  - what docs exist,
  - where they live,
  - their version and lastUpdated timestamps,
  - whether they are required or optional.

Rules:

- If index contradicts Markdown → **Markdown wins**.
- CI may validate that:
  - All `required: true` doc paths exist.
  - Versions and timestamps are syntactically valid.

### 5.2 ai-context-routing.json

Path: `app-repo/docs/ai/ai-context-routing.json`

Purpose:

- Encodes a simplified, machine-friendly version of the routing logic in this file.
- Agents may use it to quickly map:
  - path prefixes,
  - task types,
  - to specific doc lists.

Rules:

- This file is strictly a **cache** of `_AI_CONTEXT_MAP.md`.
- If they differ, `_AI_CONTEXT_MAP.md` is the source of truth.
- If missing or clearly outdated, agents should either:
  - regenerate it from the Markdown, or
  - ask for human confirmation.

---

## 6. Conflict Handling

If multiple routing rules match:

1. Prefer **more specific** over generic:
   - Block-level spec > Module-level spec > Core-level spec.
2. If still ambiguous:
   - Load the union of both **only if** they’re not contradictory.
   - If contradictory, **STOP and ask** which rule should apply.

Agents must **never silently pick** one of two conflicting specs.

---

## 7. Agent First-Run Checklist (Behavior Contract)

On first interaction in this repo, an agent must:

1. Load `_AI_MASTER_RULES.md`.  
2. Load `_AI_DOCS_OVERVIEW.md`.  
3. Load `_AI_CONTEXT_MAP.md` (this file).  
4. Classify the task (UI, storage, geo, permissions, module/block, destructive, etc.).  
5. Use the routing table to decide which **one or two core specs** to load next.  
6. If relevant, load the block/module spec and crossref for the specific area of code.  
7. If any required file is missing or obviously incomplete → **STOP and ask**.

If the agent cannot confidently determine which routing rule applies, it must **not improvise**. Ask the user for explicit direction instead of guessing.

---

_End of `_AI_CONTEXT_MAP.md`_
