# Spec & Implementation Workflow Guide

**File:** `docs/specs/Spec_Workflow_Guide.md`  
**Scope:** Applies to *all* changes that affect behavior, data, or contracts in `app-repo`  
**Audience:** Humans, VS Code AI agents, ChatGPT

This document is **authoritative** for how new features, modules, blocks, and core changes are introduced and evolved in the system.

If any other document contradicts this workflow, **this guide wins**, unless `_AI_MASTER_RULES.md` explicitly overrides it.

---

## 0. Core Principles

1. **Spec‑first, code‑second**
   - No non‑trivial behavior change should land without a spec or spec update.
   - “Spec” can be module/block spec, lib spec, or `_AI_*` system spec — but something must describe the contract.

2. **Single source of truth is split by concern**
   - **What exists & where?** → `specs/Blocks_Modules_Inventory.md`
   - **How modules work conceptually?** → `specs/modules/README.md` and module/block specs
   - **System‑wide rules (security, storage, UI, etc.)?** → `specs/core/_AI_*` docs
   - **Spec debt / missing paths?** → `docs/specs/Missing_Spec_Paths_Checklist.md`
   - **Process for changing things?** → this file (`Spec_Workflow_Guide.md`)

3. **Inventory is the router**
   - `Blocks_Modules_Inventory.md` is the index AI and humans use to find specs.
   - Every block/module/lib listed there must eventually have a `Spec Path`.

4. **AI must follow this workflow**
   - VS Code agents and ChatGPT are expected to:
     - Check inventory and specs *before* proposing code changes.
     - Update specs/inventory when suggesting new modules or breaking changes.
   - “Just patch the code” without touching specs is a violation, except for trivial internal refactors that don’t change observable behavior.

5. **Change classification first**
   - Before changing anything, classify the change:
     - New feature/module/block
     - Extension of an existing feature
     - Core/system behavior change
     - Emergency bugfix
   - The sections below define the workflow for each.

---

## 1. Change Types and Which Workflow to Use

When you get a new idea or requirement, decide which type it is:

### Type A — New Feature / Module / Block

Examples:
- New `feature.alerts` module
- New `feature.map.AnnotationService`
- New lib like `lib.notifications`

Use: **Workflow A** (New feature/module).

---

### Type B — Extension of an Existing Module

Examples:
- Add a new service to `feature.map`
- Add new method to `Core_AccessControl_Module`
- Add new block under existing module

Use: **Workflow B** (Extend existing module).

---

### Type C — Core/System‑Wide Behavior Change

Examples:
- Change how permissions work globally
- Change storage layout or project folder structure
- Change concurrency/locking behavior
- Change UI error handling rules
- Change geo/calibration model

Use: **Workflow C** (Core/system change).

Often, this touches:

- One or more core modules (e.g. `core.accessControl`, `core.storage`)
- One or more `_AI_*` system specs
- Possibly multiple feature modules

---

### Type D — Emergency Bugfix

Examples:
- Critical production bug requiring same‑day patch
- Security issue that must be fixed before full spec updates

Use: **Workflow D** (Emergency bugfix), which allows **temporarily** violating spec‑first — but requires follow‑up spec alignment.

---

## 2. Workflow A — New Feature / Module / Block

This is the “mini spec‑building cycle” for adding something new after the system is already up and running.

### A.1 Idea intake

1. Write a short description in:

   - `docs/specs/Ideas_Backlog.md` (create if missing)

   Include:
   - Name / rough ID (`feature.alerts`, `lib.annotations`, etc.)
   - Goal / problem statement
   - Rough scope (core / feature / lib / UI only)

### A.2 Add to inventory

2. Open `specs/Blocks_Modules_Inventory.md` and add a row:

   - **Name**: canonical ID (`feature.alerts`, `lib.notifications`, etc.)
   - **Kind**: `Block` or `Module` (lib modules count as modules here)
   - **Layer**: `core`, `feature`, or `lib`
   - **Status**: `idea`
   - **Notes**: 1–2 sentence description
   - **Spec Path**: leave empty for now

This makes the feature visible to both humans and AI.

### A.3 Decide and lock the Spec Path

3. Decide where the spec will live, following these patterns:

- **Core modules**:

  - `specs/modules/Core_<Name>_Module.md`  
    e.g. `specs/modules/Core_Runtime_Module.md`

- **Feature modules (top level)**:

  - `specs/modules/feature.<name>.module.md`  
    e.g. `specs/modules/feature.alerts.module.md`

- **Feature sub‑services**:

  - `specs/modules/feature.<name>/feature.<name>.<ServiceName>.md`  
    e.g. `specs/modules/feature.map/feature.map.AnnotationService.md`

- **Blocks**:

  - `specs/blocks/<name>.md`  
    e.g. `specs/blocks/feature.alerts.block.md`

- **Libs**:

  - `specs/lib/lib.<name>.md`  
    e.g. `specs/lib/lib.image.md`

4. Update the **Spec Path** column in `specs/Blocks_Modules_Inventory.md` for the new row.

### A.4 Create the spec

5. Use templates:

   - `specs/templates/Modules_Spec_Template.md`
   - `specs/templates/Blocks_Spec_Template.md`

6. Create the spec file at the decided path and fill at least:

   - Purpose
   - Responsibilities
   - Inputs / outputs
   - Dependencies
   - Permission surface (if any)
   - Data / storage behavior (if relevant)
   - Testing & observability expectations

7. When the spec is coherent enough to guide implementation, update:

   - `Status` in `specs/Blocks_Modules_Inventory.md` → `Specced`

### A.5 Align system docs (if needed)

8. If the new feature changes system‑wide rules, update relevant `_AI_*` docs in `specs/core`:

   - New permissions?  
     → `_AI_ROLES_AND_PERMISSIONS.md`
   - New storage model or paths?  
     → `_AI_STORAGE_ARCHITECTURE.md`, `_AI_DB_AND_DATA_MODELS_SPEC.md`
   - New error patterns?  
     → `_AI_ERROR_HANDLING_AND_DIAGNOSTICS_SPEC.md`
   - New UI behaviors?  
     → `_AI_UI_SYSTEM_SPEC.md`
   - New geo/image/job behavior?  
     → relevant `_AI_*` (geo, file/image, automation, etc.)

9. If the new feature is important for AI agents to reason about, update:

   - `docs/ai/ai-docs-index.json`
   - `docs/ai/ai-context-routing.json`
   - `docs/ai/_AI_CONTEXT_MAP.md`
   - `docs/ai/_AI_DOCS_OVERVIEW.md`

so that:

- The context router knows which specs to load.
- Agents don’t have to scan the whole repo.

### A.6 Implementation

10. Create a dedicated branch, e.g.:

   - `feature/feature-alerts-implementation`
   - `feature/feature-map-annotations`

11. Implement according to the spec:

   - Backend services
   - DB migrations (if any)
   - UI integration
   - Tests as described in the spec’s “Testing Strategy”

12. If you discover during coding that the spec is wrong or incomplete:

   - **Pause implementation**
   - Update the spec to match the new, better understanding
   - Only then continue implementing

Specs should be kept slightly **ahead** of the code, not behind.

### A.7 Post‑implementation cleanup

13. After merge:

   - Update `Status` in `specs/Blocks_Modules_Inventory.md` → `Done` (or your final status label)
   - If the checklist had entries for this spec path, update:
     - `docs/specs/Missing_Spec_Paths_Checklist.md`

14. If the change is large or breaks existing behavior/assumptions, consider adding a short entry in:

   - `docs/specs/CHANGELOG.md` (if you create one), or
   - `_AI_UPGRADE_CHECKLIST.md` for upgrade guidance.

---

## 3. Workflow B — Extend an Existing Module

This is when you aren’t introducing a brand new module, but significantly expanding an existing one (e.g. new service, new API, meaningful new behavior).

### B.1 Identify and mark the affected module

1. Find the module in `specs/Blocks_Modules_Inventory.md`:

   - Example: `feature.map`, `core.accessControl`, `lib.geo`

2. If the extension is substantial (e.g. new service file / new API surface), add a new **sub‑row** for the new service with:

   - **Name**: `module.ServiceName` (e.g. `feature.map.AnnotationService`)
   - **Kind**: `Module`
   - **Layer**: same as parent
   - **Status**: `idea`
   - **Spec Path**: TBD

If it’s a small addition (e.g. one new method in an existing service), you can skip adding a separate row and just update the existing spec.

### B.2 Update or create spec path

3. Decide where this extension’s spec lives:

   - New service in existing feature:  
     e.g. `specs/modules/feature.map/feature.map.AnnotationService.md`
   - Extension of an existing core module:  
     typically folded into the existing core module spec file (e.g. `Core_AccessControl_Module.md`)

4. Update `Spec Path` in the inventory for any new row you added.

### B.3 Update the module spec

5. Edit the relevant spec(s):

   - Module spec (`Core_*.md` or `feature.*.module.md`)
   - Optional sub‑service spec files under `specs/modules/<module>/...`

6. Make sure the spec changes reflect:

   - New methods / APIs
   - New types
   - New dependencies
   - Updated permission surface
   - Changes in storage or external behavior
   - Testing requirements

7. When the spec is stable, set or keep `Status = Specced` for that entry.

### B.4 System‑wide fallout

8. If the extension touches system‑wide rules, also follow **Workflow C** for those parts (see next section).

### B.5 Implementation & cleanup

9. Same as steps A.6–A.7:

   - Create branch
   - Implement
   - Ensure tests cover the new behavior
   - Update status to `Done`
   - Update changelog/upgrade checklist if relevant

---

## 4. Workflow C — Core/System‑Wide Behavior Change

This is the most sensitive kind of change: it can affect **many** modules and all AI behavior.

Examples:

- Changing permission inheritance rules (`map.read` vs `PROJECT_READ`)
- Changing storage layout under `STORAGE_ROOT/projects/...`
- Changing geo model or calibration math
- Changing error reporting contracts

### C.1 Impact analysis (spec‑only)

1. Create or update an **Impact Analysis** section in the most relevant `_AI_*` doc, e.g.:

   - `_AI_ROLES_AND_PERMISSIONS.md`
   - `_AI_STORAGE_ARCHITECTURE.md`
   - `_AI_GEO_AND_CALIBRATION_SPEC.md`
   - `_AI_UI_SYSTEM_SPEC.md`
   - `_AI_ERROR_HANDLING_AND_DIAGNOSTICS_SPEC.md`

2. In that section, document:

   - What is changing (high level)
   - Which modules and specs are affected
   - Migration/compatibility considerations
   - Any temporary dual behavior (e.g. supporting both old and new permission names)

### C.2 Update module & lib specs

3. For each affected module/lib listed in the impact analysis:

   - Locate it in `specs/Blocks_Modules_Inventory.md`
   - Ensure `Spec Path` is correct
   - Update the module/lib spec file to match the new rules.

Examples:

- Changing permission semantics:
  - Update `Core_AccessControl_Module.md`
  - Update affected feature module specs (`feature.map`, etc.)
- Changing storage layout:
  - Update `Core_ModuleStateRepository.md` if it’s impacted
  - Update any modules that rely on specific paths

### C.3 AI routing docs

4. If the change alters how AI should think or route context:

   - Update `docs/ai/_AI_DOCS_OVERVIEW.md`
   - Update `docs/ai/_AI_CONTEXT_MAP.md`
   - Update `docs/ai/ai-context-routing.json` to ensure:
     - New or changed specs are loaded for relevant contexts.
     - Old, obsolete spec paths are not used.

### C.4 Implementation plan

5. For non‑trivial core changes, consider using **feature flags** or **phased rollout**, and reflect that in:

   - The relevant `_AI_*` spec
   - The module specs (e.g. “New behavior is gated behind flag X”)

6. Follow the same implementation steps as in A.6 and A.7:

   - Dedicated branch
   - Tests
   - Inventory status updates
   - Changelog / `_AI_UPGRADE_CHECKLIST.md` entry

---

## 5. Workflow D — Emergency Bugfix

Sometimes you need to patch production **before** you have time to follow full spec‑first rigor.

This workflow is an exception and must stay rare.

### D.1 Emergency patch

1. Create a `hotfix/*` branch.

2. Fix the bug with minimal, targeted changes.

3. Add a short **Hotfix Note** somewhere stable, for example:

   - `docs/specs/Hotfix_Notes.md` (append section per hotfix)
   - Or inside the relevant module spec as a temporary “Hotfix” subsection (to be cleaned later)

The note should include:

- What was changed
- Why it was urgent
- Which module(s)/spec(s) are affected
- A TODO to update the spec later

4. Merge and deploy as required.

### D.2 Post‑hotfix spec alignment (mandatory)

5. As soon as practical (and **before** further major changes in that area):

   - Apply **Workflow B or C** to:
     - Update the relevant specs to reflect the new behavior.
     - Update inventory status if needed.
     - Update `_AI_*` docs if system‑wide rules changed.

6. Remove or fold “Hotfix” notes into the **proper spec sections** once aligned.

Emergency code must not become permanent “mystery behavior”.

---

## 6. AI Governance Rules

These rules apply to **all AI agents** (VS Code, ChatGPT, etc.) working on this repo.

1. **Always check inventory first**
   - Before editing a spec or code, AI must:
     - Look at `specs/Blocks_Modules_Inventory.md` to understand:
       - Whether a module/block already exists
       - Where its spec lives
       - Its current status

2. **Specs are authoritative for behavior**
   - When code and spec disagree:
     - The spec is considered the intended behavior.
     - The code must either be fixed to match the spec, or
     - The spec must be updated — explicitly and intentionally — before further code changes.

3. **No new modules without inventory + spec**
   - AI must not introduce a new module or block purely in code.
   - It must:
     - Add an entry to `specs/Blocks_Modules_Inventory.md`
     - Assign a `Spec Path`
     - Create or update a spec file using templates

4. **System rules live in `_AI_*` specs**
   - AI must not silently change:
     - Permissions
     - Storage layout
     - Concurrency rules
     - Core UI patterns
     - Geo/calibration math
   - without updating the relevant `_AI_*` spec(s) and, if needed, the upgrade checklist.

5. **Routing configs must be kept in sync**
   - When AI introduces or significantly changes a spec that should be part of AI context selection, it must:
     - Update `docs/ai/ai-docs-index.json`
     - Update `docs/ai/ai-context-routing.json`
     - Update `docs/ai/_AI_CONTEXT_MAP.md` as needed

6. **Checklists and debt tracking**
   - When AI creates a new module or spec path but doesn’t fully implement the spec:
     - It should ensure `Status` in the inventory reflects reality.
     - It should update `docs/specs/Missing_Spec_Paths_Checklist.md` if there are still unlinked or missing specs.

7. **Respect this workflow**
   - Any proposal that deviates from this workflow should:
     - Explicitly call out the deviation and why (e.g. emergency hotfix)
     - Include a follow‑up plan to bring things back in line.

---

## 7. Summary Cheat Sheet

When you want to **add or change something** after the system is “done”:

1. **Classify** the change: A (new), B (extend), C (core), or D (emergency).
2. **Inventory**: update `specs/Blocks_Modules_Inventory.md`.
3. **Spec Path**: decide and fill.
4. **Spec**: create/update using templates.
5. **System docs**: update `_AI_*` if core rules changed.
6. **AI routing**: update `docs/ai/*` if needed.
7. **Implementation**: branch, code, tests.
8. **Cleanup**: update inventory status, checklists, changelog/upgrade docs.

This guide is the **go‑to process** for future‑you and future‑AI when evolving the system from “100% done” to “100% done, plus this new thing”. 
