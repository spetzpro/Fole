# Spec & Implementation Workflow Guide

**File:** `app-repo/specs/Spec_Workflow_Guide.md`  
**Scope:** Applies to *all* changes that affect behavior, data, or contracts in `app-repo`.  
**Audience:** Humans, VS Code AI agents, ChatGPT, CI.

This document is **authoritative** for how new features, modules, blocks, and core changes are introduced and evolved.

If any other document contradicts this workflow, **this guide wins**, unless `_AI_MASTER_RULES.md` explicitly overrides it.

---

## 0. Core Principles

1. **Spec-first, code-second**

   - No non-trivial behavior change is allowed without a spec (or spec update).
   - “Spec” can be:
     - Block spec (using `Blocks_Spec_Template.md`),
     - Module spec (using `Modules_Spec_Template.md`),
     - System/core spec (any `_AI_*.md`).
   - A change is “non-trivial” if it affects:
     - User-visible behavior, or  
     - Stored data shape, or  
     - Public API / contracts (internal or external).

2. **Split sources of truth by concern**

   - **What exists & lifecycle state?**  
     → `specs/Blocks_Modules_Inventory.md`
   - **How modules/blocks work?**  
     → Block and module specs under `specs/blocks/**` and `specs/modules/**` (using templates).
   - **System-wide rules (security, storage, UI, etc.)?**  
     → `specs/core/_AI_*.md`
   - **Workflow & governance?**  
     → this file.

3. **Inventory is the router**

   - `Blocks_Modules_Inventory.md` is the **index** AI and humans use to discover:
     - All blocks/modules/libs.
     - Their **status** (Planned / Specced / In implementation / Implemented / Stable).
     - Where their specs live.
   - Once introduced, a **canonical JSON inventory** (see §6) is treated as the machine-readable equivalent of this file.

4. **Planned vs Implemented must be explicit in specs**

   Every block/module spec MUST contain a clear distinction between:

   - **Planned** – things the spec describes, but code does **not** yet do.
   - **Implemented** – behavior that is live in `main`.

   This is typically a dedicated section:

   ```md
   ## Planned vs Implemented

   - Planned:
     - <bullets>
   - Implemented:
     - <bullets>
   ```

   > Templates **must** support this – see updated templates in `specs/templates`.

5. **Strict spec–inventory–code alignment**

   For any module / block:

   - If **inventory says** “Specced”:
     - Block/module spec exists.
     - Code may or may not exist, but MUST NOT claim features as Implemented.
   - If **inventory says** “Implemented”:
     - There is code in `main`.
     - The spec’s “Implemented” list matches actual behavior.
   - If **inventory says** “Stable”:
     - Code is in `main`, covered by tests, and spec is up-to-date for all major behaviors.

6. **AI must follow this workflow**

   - VS Code agents & ChatGPT must **check inventory + spec** before touching code.
   - If a change would violate this document, AI must:
     - Refuse or
     - Ask for a spec update / owner decision.

7. **Change classification first**

   Before making any change, classify it into **Type A/B/C/D** (see §1).  
   The type determines the workflow, required spec updates, and approvals.

---

## 0.1 Hierarchy of Truth (L0–L4)

We use an explicit hierarchy of documents / artifacts:

- **L0 – Master Rules**
  - `_AI_MASTER_RULES.md` (if present).
  - Defines global non-negotiable rules (security invariants, compliance constraints).

- **L1 – Workflow & Governance**
  - This file: `Spec_Workflow_Guide.md`.
  - Any doc that defines **how** changes are made (tiered loops, approvals, debt handling).

- **L2 – System Specs**
  - `_AI_*.md` core specs (storage, UI system, geo, image pipeline, etc.).
  - Define cross-cutting behavior and guardrails that modules must follow.

- **L3 – Block & Module Specs**
  - Individual module/block specs under `specs/modules/**` and `specs/blocks/**`.
  - These specify contracts, data shapes, operations, error models, etc.

- **L4 – Implementation & Tests**
  - `src/**` code and `tests/**`.

**Conflict rule:**

- L0 > L1 > L2 > L3 > L4  
- Changing something at level *n* that conflicts with *n–1* or above is forbidden unless the higher-level artifact is updated first.

---

## 1. Change Types

Every change is classified as exactly one of these:

1. **Type A – New Feature / Module / Block**
   - You are introducing something that does not exist in the inventory.

2. **Type B – Extend an Existing Module / Block**
   - You are adding capabilities, fields, or operations to something that **already exists**.

3. **Type C – Core / System-Wide Behavior Change**
   - You are changing cross-cutting behavior (e.g. auth semantics, storage guarantees, UI shell, geo pipeline).

4. **Type D – Emergency Bugfix (Hotfix)**
   - You are urgently fixing a defect in production-like environments, and you cannot follow the full A/B/C workflow synchronously.

Each type is executed via a **tiered change loop** (L1/L2/L3) and corresponding workflow (§2–§5).

---

## 1.1 Tiered Change Loops (L1/L2/L3)

We treat change impact with three loops:

- **L1 Loop – Local, non-breaking**
  - Scope: single module/block, internal behavior change, no external contract break.
  - Example: refine logging, tighten validation, add a new non-breaking field with a default.
  - Approval: Module Owner, and **Architecture Owner** if it touches any L2 system spec.

- **L2 Loop – Cross-module, non-breaking**
  - Scope: multiple modules/blocks, still backward-compatible externally.
  - Example: adding centralized diagnostics hooks impacting several modules.
  - Approval: Module Owners involved + Architecture Owner.

- **L3 Loop – Breaking or global**
  - Scope: changes user-visible behavior, public APIs, or data formats in a breaking way.
  - Requires:
    - Explicit migration plan in specs.
    - Inventory updates for all impacted entities.
  - Approval: Architecture Owner + any relevant product/ops stakeholder.

> When in doubt about the loop: **escalate to the Architecture Owner** and assume **L2** by default.

---

## 2. Workflow A – New Feature / Module / Block

Applies to: Type A changes.

### A.1 Plan & Inventory

1. **Start at the inventory**
   - Add a row to `Blocks_Modules_Inventory.md` for the new block/module/lib with:
     - Name (e.g. `feature.map`).
     - Kind (Block / Module / Lib).
     - Layer (core / feature / lib).
     - Status: `Planned`.
     - Notes: short description.
     - Spec Path: where the spec will live (folder or file).

2. If the change is cross-cutting or touches a system spec:
   - Classify as L2 or L3 loop and note that in the Notes column.

### A.2 Write the Spec (Spec-first)

1. **Choose template**:

   - For a block: `specs/templates/Blocks_Spec_Template.md`.
   - For a module: `specs/templates/Modules_Spec_Template.md`.

2. **Create the spec file** under:

   - Blocks → `specs/blocks/<name>.block.md`
   - Modules → `specs/modules/<name>/<name>.module.md` (or similar folder naming).

3. **Fill in**:
   - Core template fields (ID, purpose, state shape, operations/blocks).
   - **Planned vs Implemented** section (even if everything is initially Planned).
   - Dependencies section that includes:
     - Other modules.
     - Core system specs it relies on (e.g. `_AI_STORAGE_SPEC.md`).

4. Mark the inventory row status → `Specced`.

### A.3 Approvals

1. For L1 loop:
   - Module/block spec approved by Module Owner (or Architect if new core/feature).

2. For L2/L3:
   - Architecture Owner must explicitly sign off on:
     - Spec location and naming.
     - Planned vs Implemented scope.
     - Interactions with system specs.

### A.4 Implementation

1. Only when spec is at least “Specced”:
   - Create branch using a convention like:  
     `feature/<module-or-block-id>` or `core/<id>`.

2. Implement code under `src/**` to match:
   - Inputs/outputs.
   - State shape.
   - Error model and side effects.

3. Add tests according to spec’s **Test Cases/Test Matrix**.

4. Update spec’s **Planned vs Implemented**:
   - Move implemented behavior from Planned → Implemented.
   - Note any partial / behind-a-flag behavior.

5. Update inventory:
   - When branch merged:
     - `Specced` → `Implemented` (if code exists and aligns with spec).
   - Later, once tests and usage are stable:
     - `Implemented` → `Stable`.

---

## 3. Workflow B – Extend an Existing Module / Block

Applies to: Type B changes.

### B.1 Classify Impact (L1/L2/L3)

1. Does this extension:
   - Change public API signatures?
   - Change serialized data formats?
   - Modify cross-module behavior?

2. If **yes** to any, treat as L2/L3.

### B.2 Spec First

1. Locate the existing spec via `Blocks_Modules_Inventory.md`.

2. Update the spec:
   - Extend **State Shape**, **Public API / Blocks** sections.
   - Update **Error Model** and **Dependencies** if needed.
   - Update **Planned vs Implemented** to:
     - Capture the new behavior under Planned.
     - Move to Implemented once live.

3. Ensure templates’ structure is respected; if missing fields:
   - Prefer adding new sections instead of ad-hoc notes.

### B.3 Inventory and Status

- If module was `Stable` and you add new planned behavior:
  - Inventory status may remain `Stable`, but:
    - You must clearly mark new behavior as Planned until implemented.
- If change is large/touching foundations:
  - Temporarily move to `In implementation` while refactoring, then back to `Stable`.

---

## 4. Workflow C – Core / System-Wide Behavior Change

Applies to: Type C changes (L2 or L3 loops).

Typical examples:

- Change how atomic writes work in storage.
- Change auth/permissions semantics.
- Change how the UI shell structures navigation.

### C.1 Touch L2 Specs First

1. Locate relevant `_AI_*.md` system specs (e.g. storage, UI, geo, image).
2. Update those specs:
   - Introduce new invariants.
   - Deprecate old behavior.
   - Define migrations if breaking.

3. Link from system spec to affected modules/blocks.

### C.2 Propagate to Modules & Inventory

1. Identify impacted modules/blocks in `Blocks_Modules_Inventory.md`.
2. For each:
   - Update its spec to reference the new system behavior.
   - Update **Planned vs Implemented** to reflect the transition.
   - Mark inventory status appropriately (e.g. `In implementation` during rollout).

### C.3 Approvals

- Architecture Owner must approve:
  - L2/L3 system spec changes.
  - Migration strategy (if any).
  - Completion criteria to move impacted modules back to `Stable`.

---

## 5. Workflow D – Emergency Bugfix (Hotfix Debt)

Applies to: Type D changes (urgent fixes).

### D.1 Minimal Safe Patch

1. You may patch code directly to address the emergency **if**:
   - You log a **Hotfix Debt artifact** (see next section).
     - You do NOT widen the change beyond what’s necessary.

2. Ideally:
   - Patch branch is clearly named: `hotfix/<issue-id>`.

### D.2 Hotfix Debt Artifact

For each hotfix that bypasses full spec-first flow:

1. Create a short markdown artifact (for example):  
   `specs/debt/hotfix/<YYYYMMDD>-<id>.md`

2. Include:
   - What was broken.
   - What quick change was made and where.
   - Which module/block/system specs are *potentially* out of sync.

3. Mark impacted modules in inventory with a note:
   - e.g. “Hotfix debt: HF-2025-03 affects error handling path”.

### D.3 Cleanup Workflow

Within the next planned work cycle:

1. Convert each hotfix into a proper **Type B or C** change:
   - Update relevant specs.
   - Reconcile implementation.
   - Update inventory and Hotfix Debt artifact (mark as resolved).

---

## 6. Canonical Inventory & JSON Artifacts

We currently have `Blocks_Modules_Inventory.md` as the human-readable source of truth.

We also introduce a **canonical machine-readable inventory** to enable CI and tooling:

- File: `specs/inventory/inventory.json`
- Schema: `specs/inventory/inventory.schema.json`

**Rules:**

- Markdown + JSON MUST be kept in sync.
- For any change in one, the other must be updated in the same PR.
- CI will validate:
  - JSON schema.
  - Cross-links between spec paths and actual files.

Later we may introduce per-module inventory fragments, aggregated into the canonical inventory via tooling. This guide remains valid; it simply defines how these artifacts relate.

---

## 7. CI-Enforceable Artifacts & Checks

The spec-first governance is enforced by CI where possible.

Concrete artifacts:

- **Inventory (machine-readable)**  
  - File: `specs/inventory/inventory.json`  
  - Schema: `specs/inventory/inventory.schema.json`  
  - Validator script: `scripts/specs/validateInventory.js`

- **Dependency governance**  
  - Rules: `specs/dependencies/allowed_dependencies.json`  
  - Validator script: `scripts/specs/validateDependencies.js`

Future (and partly existing) checks include:

1. **Spec presence check**
   - For any new module under `src/**`, CI ensures:
     - There is a corresponding spec entry in the JSON inventory.
     - The spec file exists at the declared path.

2. **API-change detection**
   - When public APIs change:
     - CI requires a reference to the spec diff (or confirms spec hasn’t changed if compatible).

3. **Inventory schema validation**
   - Validate `inventory.json` against a schema.
   - Ensure statuses are only from the allowed set.
   - Ensure spec paths point to existing files.

4. **Planned vs Implemented sanity**
   - Optionally, scripts can:
     - Verify that specs marked `Stable` have non-empty Implemented sections.
     - Flag cases where inventory says `Implemented` but spec has no Implemented bullets.

5. **Debt registry checks**
   - Ensure all files under `specs/debt/hotfix/**` either:
     - Link to open tasks, or
     - Are marked resolved.

---

## 8. Drift Audits & Quarterly Governance

To avoid silent drift between specs, inventory, and code, we run **drift audits** regularly (recommended: quarterly).

### 8.1 Drift Audit Scope

For each quarter:

1. Enumerate all modules/blocks with status:
   - `Implemented`
   - `Stable`

2. For each:
   - Compare code against spec:
     - APIs.
     - State shape.
     - Error model.
   - Confirm inventory status matches reality.

3. Log any discrepancies:
   - Missing or outdated sections in specs.
   - Behavior implemented but only listed as Planned.
   - Inventory status inconsistent with tests/usage.

### 8.2 Drift Sitrep

Output a short sitrep document per audit:

- e.g. `specs/governance/drift_sitrep_YYYY_QN.md`
- Includes:
  - Modules with drift.
  - Required follow-up actions (spec updates, code changes, tests).
  - Any unresolved Hotfix Debt.

---

## 9. AI Governance Rules (for Tools & Agents)

AI copilots (VS Code agents, ChatGPT, etc.) must follow these rules:

1. **Always start at inventory**
   - Locate block/module/lib and its spec path via `Blocks_Modules_Inventory.md` (and `specs/inventory/inventory.json`).

2. **Never edit code without checking specs**
   - Read relevant specs before applying changes.

3. **Respect Planned vs Implemented**
   - Do not implement Planned items “silently”.
   - If implementing, update spec & inventory or explicitly ask human to do so.

4. **Escalate tier decisions**
   - If unsure whether a change is L1/L2/L3, ask the Architecture Owner.

5. **Record debts**
   - For emergency fixes, ensure a Hotfix Debt artifact is logged.

6. **Don’t downgrade statuses**
   - Only humans (or explicit tasks) can move modules from Stable → lower status.

7. **Prefer small, well-scoped PRs**
   - Changes should align tightly with one change type (A/B/C/D).

---

## 10. Summary Cheat Sheet

- **Need something new?**  
  → Type A, Workflow A, start at inventory, then write spec via template, then code.

- **Extend an existing module/block?**  
  → Type B, Workflow B, update spec first, then code, then inventory.

- **Change cross-cutting behavior?**  
  → Type C, Workflow C, system specs first, then module specs, then inventory & code.

- **Emergency fix?**  
  → Type D, Workflow D, patch code with Hotfix Debt artifact, then clean up into A/B/C.

- **Who approves?**  
  - Local changes: Module Owner (L1).  
  - Cross-cutting & system changes: Architecture Owner (L2/L3).  
  - L0/L1 spec changes (this guide, master rules): Architecture Owner explicitly.
