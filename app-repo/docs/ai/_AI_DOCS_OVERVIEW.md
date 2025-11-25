# _AI_DOCS_OVERVIEW.md

**Document Version:** 1.1  
**Last Updated:** YYYY-MM-DD

# AI Documentation Overview & Context Routing Entry Point

This document is the first file any AI agent must load after `_AI_MASTER_RULES.md`.  
It defines where AI documentation lives, how it should be loaded, and how agents must avoid loading unnecessary context.

---

## 1. Canonical Paths

All paths relative to repo root:

```
app-repo/
  docs/
    ai/
  specs/
    core/
    modules/
    blocks/
```

These are authoritative.

---

## 2. Core AI Documents

Loaded depending on task.

### 2.1 Foundational Governance (Always Required)

* `_AI_MASTER_RULES.md`
* `_AI_DOCS_OVERVIEW.md`
* `_AI_CONTEXT_MAP.md`

### 2.2 Architecture-Wide Specifications (Load When Needed)

Systems:

* `_AI_STORAGE_ARCHITECTURE.md`
* `_AI_TEMPLATES_AND_DEFAULTS.md`
* `_AI_ROLES_AND_PERMISSIONS.md`
* `_AI_DB_AND_DATA_MODELS_SPEC.md`
* `_AI_CONCURRENCY_AND_LOCKING_SPEC.md`

UI:

* `_AI_UI_SYSTEM_SPEC.md`
* `_AI_VIEWER_AND_TOOLING_SPEC.md` (if present)

Maps/Geo:

* `_AI_GEO_AND_CALIBRATION_SPEC.md`
* `_AI_MAP_TILE_PIPELINE_SPEC.md` (if present)

### 2.3 Core Module Specs (MUST load when working on backend core or module logic)

These define the foundational modules that all other modules depend on:

* `specs/modules/Core_ModuleStateRepository.md`
* `specs/modules/Core_AccessControl_Module.md`
* `specs/modules/Core_UI_Module.md`

If an agent touches:
- module logic  
- state handling  
- permission checking  
- UI view-model contracts  

→ these specs must be loaded.

---

## 3. Module & Block Specifications

```
app-repo/specs/modules/<moduleName>/
app-rerepo/specs/blocks/<blockName>/
```

Each module folder contains:

* The module spec
* Optional sub-specs for internal services

Each block folder contains:

* The block spec
* Optional cross-references

### 3.1 Architectural Index (High-Level Inventory)

Agents MUST use the following file to understand what modules/blocks exist and their lifecycle stage:

```
specs/Blocks_Modules_Inventory.md
```

This file is the authoritative source for:
- all modules  
- all blocks  
- their status (“Specced”, “Implemented”, etc.)  
- whether they are core, feature, or lib  

Agents must consult this before:
- creating new modules or blocks  
- modifying existing ones  
- inferring dependencies  

---

## 4. Machine-Readable Index

Located at:

```
app-repo/docs/ai/ai-docs-index.json
```

Agents must load this after `_AI_DOCS_OVERVIEW.md`.

---

## 5. Context Routing Rules

Agents must only load relevant specs. Full logic lives in `_AI_CONTEXT_MAP.md`.

Example routing:
| If working on… | Load… |
|----------------|--------|
| UI | `_AI_UI_SYSTEM_SPEC.md`, module UI specs |
| Storage | `_AI_STORAGE_ARCHITECTURE.md`, Core_ModuleStateRepository |
| Geo | `_AI_GEO_AND_CALIBRATION_SPEC.md` |
| Permissions | `_AI_ROLES_AND_PERMISSIONS.md`, Core_AccessControl_Module |
| Block | That block’s spec + inventory entry |
| Module | Module spec + inventory entry + any linked core module specs |

---

## 6. Conflict Resolution

1. `_AI_MASTER_RULES.md`  
2. `_AI_CONTEXT_MAP.md`  
3. Core architecture specs  
4. Module/block specs  
5. Code (last)  

If code contradicts specs → code must be fixed.

---

## 7. Enforcement Hooks

* `.github/workflows/validate-crossref.yml`
* `tools/ai/destructive-change-schema.json`
* `tools/ai/crossref-schema.json`

---

## 8. Agent First-Run Checklist

1. Load `_AI_MASTER_RULES.md`  
2. Load `_AI_DOCS_OVERVIEW.md`  
3. Load `ai-docs-index.json`  
4. Load `_AI_CONTEXT_MAP.md`  
5. Load relevant core/module/block specs as needed  
6. If unsure → ask  

---

End of file.
