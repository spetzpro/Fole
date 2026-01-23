# FOLE (Flexible Open Layout Engine)

FOLE is a **configurable, runtime-editable platform** for building precise, map-centric applications — from millimeter-accurate indoor floor plans and factory layouts to globe-scale terrain visualization — all within a single coordinate system and governed by strong AI-assisted development rules.

The long-term vision: sysadmins and power users compose entire features (UI, workflows, data models) live inside the running application via a declarative configuration builder, without redeploying code.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)  
[![Status: Early Scaffolding](https://img.shields.io/badge/status-early--scaffolding-orange)](#status)

---

## Vision & Core Promises

- Configuration is **authoritative** and stored as JSON blocks.
- The application is **runtime-editable** with strong governance.
- All changes are **versioned, validated, and rollbackable**.
- The frontend is a **generic renderer/interpreter**, not a hardcoded feature set.
- The backend is the **authority** for permissions, validation, and data integrity.
- **Activated configurations are always recoverable** (via rollback).

---

## Repository Layout

- `app-repo/` – Source-controlled application code and documentation  
  - `docs/` – High-level and AI governance docs  
  - `specs/` – Core, module, and block specifications  
- `.github/workflows/` – CI governance and validation  
- `tools/` – Validation and enforcement tooling  
- `localstorage/` – Local runtime storage (ignored by Git)  
- `node_modules/` – Tooling dependencies only

---

## Storage Root

Runtime data lives under `STORAGE_ROOT` (outside Git).  
In-repo storage must use `app-repo/.storage/` (hidden, ignored).

---

## AI Governance & Rules

AI-assisted development is governed by:

- `app-repo/docs/ai/_AI_MASTER_RULES.md`

These rules define:
- allowed vs restricted changes
- destructive-change handling
- required spec alignment
- approval boundaries

---

## Config-Driven Application Builder (Release Vision)

### 1 TL;DR

FOLE is a **governed, versioned, runtime-editable application builder**.

Sysadmins compose applications from shipped primitives (nodes, actions, templates, themes).  
Changes flow through **Draft → Preflight → Activate → Rollback**.  
The system is declarative, auditable, and safe by design.

---

### 2 How it looks and feels to use

- Create **Features** (feature groups).
- Add navigation (header, menu, slots).
- Define **Windows** and **UI Elements** (text, tables, forms, viewers).
- Everything inherits defaults unless explicitly overridden.
- Inherited values are visually marked.
- Issues are detected before activation.
- Rollback is always one click away.

You are effectively **building (and evolving) an app inside the running app** — safely, version by version.

---

### 3 How it works (overview)

- **Frontend** interprets declarative UI graphs and renders nodes.
- **Backend** validates, governs, and executes with authority.

<details>
<summary><strong>Deeper dive: Frontend vs Backend responsibilities</strong></summary>

**Frontend**
- Interprets resolved config graphs.
- Renders UI nodes generically.
- Evaluates conditions for UX only.
- Never grants permissions.

**Backend**
- Owns versions, activation, rollback.
- Validates configs (schemas, inheritance, references).
- Enforces permissions.
- Manages data models and migrations.
- Executes actions safely.
</details>

---

## Terminology (UI ↔ Code)

| UI Term | Code Term | Notes |
|---|---|---|
| Version | Config Bundle Version | Activation unit |
| Block | Block | `{blockId, blockType, data}` |
| Feature | Feature Group | `feature.group` |
| Shell | Shell Block | `*.shell` |
| Window | Window Node | `ui.node.window` |
| UI Element | UI Node | `ui.node.*` |
| Built-in Tool | Built-in Node | e.g. `ui.node.pdfViewer` |
| Template | Template Block | via `inheritFrom` |
| Theme | Theme Block | Token-based |
| Action | Action Block | Server-authoritative |
| Binding | Binding Descriptor | Data linkage |
| Condition | Condition Expression | `visibleWhen`, `enabledWhen` |
| Data Model | Model Block | Schema + migrations |

All interactive nodes support:
- `helpText`
- `requiredPermission`
- `visibleWhen` / `enabledWhen`

---

## Permissions, Conditions & Safety

- **Permissions** decide what is allowed (server-side).
- **Conditions** decide what is shown/enabled (UI only).
- Conditions never grant access.
- Actions are always permission-checked.

<details>
<summary><strong>Condition language (v1+)</strong></summary>

Conditions support:
- boolean logic (`and`, `or`, `not`)
- comparisons (`== != > >= < <=`)
- existence checks and basic string operations
- named query results  

Regex and advanced queries are gated, bounded, and validated when enabled.
</details>

---

## Performance & Guardrails

The system prioritizes predictability and safety over unbounded flexibility.

<details>
<summary><strong>Performance strategy</strong></summary>

- Prefer backend compilation per version (resolved graph).
- Stable IDs + memoization to minimize re-renders.
- Virtualization for large tables/lists.
- Enforced guardrails:
  - max nodes per window
  - max nesting depth
  - max bindings/expressions per view
</details>

---

## Contributor Workflow & Spec Alignment

FOLE follows a **spec-first workflow**.

| Change Type | Tier | Update Spec | Update Inventory | Approval |
|---|---|---|---|---|
| Docs, tests, refactors | L1 | No | No | No |
| API / schema / UX change | L2 | Yes | Yes | Review |
| New module / deprecation | L3 | Yes | Yes | Sitrep + Approval |

Specs live under `app-repo/specs/`.  
Inventory tracks implementation status.

---

## Forking & Governance

Forks may relax governance.  
Upstream contributions must follow spec and inventory rules.

---

## Tools & CI

Node.js is used **only for tooling**:
- schema validation
- cross-reference checks
- AI change-governance enforcement

No production runtime dependency.

---

## Status

**Early scaffolding / design phase.**

Near-term focus:
- Finalize block graph semantics & resolved-graph compiler
- Bootstrap sysadmin builder UI (hardcoded seed)
- Define & implement initial built-in node types

See roadmap:
- `app-repo/specs/core/_AI_CORE_BUILD_ROADMAP.md`

---

Curious about governed, runtime-configurable application platforms?

→ Read the [AI Master Rules](app-repo/docs/ai/_AI_MASTER_RULES.md)  
→ Review the [Core Roadmap](app-repo/specs/core/_AI_CORE_BUILD_ROADMAP.md)  
→ Open an issue or discussion — early input shapes the direction.
