# _AI_DOCS_OVERVIEW.md

**Document Version:** 1.0
**Last Updated:** YYYY-MM-DD

# AI Documentation Overview & Context Routing Entry Point

This document is the first file any AI agent must load after `_AI_MASTER_RULES.md`. It defines where AI documentation lives, how it should be loaded, and how agents must avoid loading unnecessary context.

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
localstorage/
tools/
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
* `_AI_DBS_AND_DATA_MODELS.md`

UI:

* `_AI_UI_SYSTEM_SPEC.md`
* `_AI_VIEWER_AND_TOOLING_SPEC.md`

Maps/Geo:

* `_AI_GEO_AND_CALIBRATION_SPEC.md`
* `_AI_MAP_TILE_PIPELINE_SPEC.md`

---

## 3. Module & Block Specifications

```
app-repo/specs/modules/<moduleName>/
app-repo/specs/blocks/<blockName>/
```

Each block folder contains:

* Block spec md
* `crossref/ai-library-index.json`

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
| UI | `_AI_UI_SYSTEM_SPEC.md`, `_AI_VIEWER_AND_TOOLING_SPEC.md` |
| Storage | `_AI_STORAGE_ARCHITECTURE.md` |
| Geo | `_AI_GEO_AND_CALIBRATION_SPEC.md`, `_AI_MAP_TILE_PIPELINE_SPEC.md` |
| Permissions | `_AI_ROLES_AND_PERMISSIONS.md` |
| Block | That block’s md + crossref JSON |

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
5. Load only relevant specs
6. If unsure → ask user

---

End of file.
