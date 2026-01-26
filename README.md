# FOLE (Flexible Open Layout Engine)

FOLE is a **configurable, runtime-editable platform** for building precise, map-centric applications — from millimeter-accurate indoor floor plans and factory layouts to globe-scale terrain visualization — all within a single coordinate system and governed by strong AI-assisted development rules.

The long-term vision: sysadmins and power users compose **entire application features** (UI, workflows, data models, storage structures) live inside the running application via a declarative configuration builder, without redeploying code, while the backend enforces safety, governance, and correctness.

[![License: LGPL-2.1](https://img.shields.io/badge/License-LGPL--2.1-blue.svg)](https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html)  
[![Status: Early Scaffolding](https://img.shields.io/badge/status-early--scaffolding-orange)](#status)

---

## Vision & Core Promises

- Configuration is **authoritative** and stored as JSON blocks.
- The application is **runtime-editable** with strong governance.
- All changes are **versioned, validated, and recoverable**.
- The frontend is a **generic renderer/interpreter**, not a hardcoded feature set.
- The backend is the **authority** for permissions, validation, and data integrity.
- Features, UI, workflows, and data models are **composed from governed primitives**, not handwritten code.
- Activated configurations are always **recoverable via version rollback**.

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

## Config-Driven Application Builder (Final Vision)

### 1. TL;DR

FOLE is a **governed, versioned, runtime-editable application builder**.

Sysadmins compose applications from **shipped primitives and built-in tools** (UI nodes, actions, templates, themes, data models).  
All changes flow through **Draft → Preflight → Activate → Rollback**.  
The system is declarative, auditable, and safe by design.

FOLE is not a page editor — it is a **live application construction system**.

---

### 2. How it looks and feels to use

- Create **Features** (feature groups).
- Add navigation by placing elements into **slots** (header, menu, toolbars, panels).
- Define **Windows** and compose **UI Nodes** (text, tables, forms, viewers, tools).
- Everything **inherits defaults** unless explicitly overridden.
- Inherited values are clearly marked in the UI.
- Validation issues are detected before activation.
- Rollback to a known-good version is always one click away.

You are effectively **building and evolving a running application from inside itself**, with guardrails.

---

### 3. How it works (overview)

- **Frontend** interprets resolved declarative UI graphs and renders nodes.
- **Backend** validates, governs, and executes with authority.

<details>
<summary><strong>Deeper dive: Frontend vs Backend responsibilities</strong></summary>

**Frontend**
- Interprets resolved configuration graphs.
- Renders UI nodes generically.
- Evaluates conditions for UX purposes only.
- Never grants permissions or bypasses authority.

**Backend**
- Owns versions, activation, and rollback.
- Validates configurations (schemas, inheritance, references, limits).
- Enforces permissions and preconditions.
- Manages data models, storage backends, and migrations.
- Executes actions safely and audibly.
</details>

---

## Terminology (UI ↔ Code)

| UI Term | Code Term | Notes |
|---|---|---|
| Version | Config Bundle Version | Atomic activation unit |
| Block | Block | `{blockId, blockType, data}` |
| Feature | Feature Group | `feature.group` |
| Shell | Shell Block | Layout + slot orchestration |
| Slot | Slot Identifier | Placement target (e.g. `app.header.left`) |
| Window | Window Node | `ui.node.window` |
| UI Element | UI Node | `ui.node.*` |
| Built-in Tool | Built-in Node | e.g. `ui.node.pdfViewer` |
| Template | Template Block | via `inheritFrom` |
| Theme | Theme Block | Token-based visuals |
| Action | Action Block | Server-authoritative |
| Binding | Binding Descriptor | Data linkage |
| Condition | Condition Expression | `visibleWhen`, `enabledWhen` |
| Data Model | Model Block | Schema + migrations |
| Surface / Viewport | Surface Node | Shared interactive context |

All interactive nodes support:
- `helpText`
- `requiredPermission`
- `visibleWhen` / `enabledWhen`

---

## Built-in Nodes, Tools & Extensibility

FOLE ships with a **well-defined set of built-in node types** (primitives and tools), such as buttons, text, containers, windows, tables, forms, viewers, and interactive surfaces.

Sysadmins compose features from these nodes declaratively.

Developers extend the system by **adding new node types in code** (with schemas, capabilities, and governance rules).  
Once added, these nodes become immediately available for configuration and composition.

---

## Sysadmin Builder (Meta-Tool)

The sysadmin configuration interface itself is a **built-in meta-tool**.

- Its structure and behavior are hardcoded for safety and recoverability.
- Its visuals are **theme-driven** via global tokens and an optional builder theme profile.

A safe fallback theme is always available.

---

## Permissions, Conditions & Safety

- **Permissions** decide what is allowed (server-side authority).
- **Conditions** decide what is shown or enabled (UX only).
- Conditions never grant access.
- Actions are always permission-checked at execution time.

Conditions may reference:
- runtime state
- bindings
- named query results

Advanced matching (including regex) is supported where enabled, subject to validation, limits, and backend enforcement.

---

## Data Models, Storage & Migrations

Sysadmins can define and evolve:
- data models (tables, fields, relations)
- storage backends (databases, file stores, image stores)

All data model changes are:
- versioned
- validated
- governed by permissions
- reviewed during preflight

Configuration rollback is always supported.  
Physical data schema changes may be forward-only; configuration, UI, and behavior remain versioned and recoverable.

---

## Performance & Guardrails

The system prioritizes predictability, safety, and scalability.

- Backend compiles and resolves configuration graphs per version.
- Frontend renders resolved graphs with stable IDs and memoization.
- Large lists and tables are virtualized.
- Guardrails enforce bounded complexity (nesting depth, node counts, expression limits).

---

## Design Constraints (Intentional)

- No arbitrary code execution inside configuration
- No raw SQL embedded in configuration
- All actions map to governed backend capabilities
- Expressions are declarative and bounded
- Authority is never delegated to the frontend

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
- Bootstrap sysadmin builder UI (meta-tool)
- Define and implement initial built-in node and tool types

See roadmap:
- `app-repo/specs/core/_AI_CORE_BUILD_ROADMAP.md`

---

Curious about governed, runtime-configurable application platforms?

→ Read the [AI Master Rules](app-repo/docs/ai/_AI_MASTER_RULES.md)  
→ Review the [Core Roadmap](app-repo/specs/core/_AI_CORE_BUILD_ROADMAP.md)  
→ Open an issue or discussion — early input shapes the direction.
