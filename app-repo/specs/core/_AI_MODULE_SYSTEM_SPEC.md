# _AI_MODULE_SYSTEM_SPEC.md  
**Version:** 1.0.0  
**Last Updated:** 2025-11-23  
**Status:** Authoritative Specification (SSOT)

# AI Module System Specification  
How modules are defined, enabled, disabled, validated, loaded, and constrained.

This document defines the **complete ruleset** governing FOLE modules:
- directory layout  
- lifecycle  
- activation & deactivation  
- dependencies  
- capabilities  
- crossref requirements  
- strict rules for AI agents  

It is binding for **all AI agents**, **backend services**, and **module developers**.

---

# 1. PURPOSE OF THE MODULE SYSTEM

The module system exists to:

1. Ensure **deterministic, isolated, predictable behavior** across all modules.  
2. Provide explicit **enable/disable** controls.  
3. Define **dependencies**, **capabilities**, and **required specs**.  
4. Ensure modules do not break core invariants.  
5. Prevent AI from creating “partial” or inconsistent module structures.  
6. Support versioning, migration, and safe runtime updates.  
7. Ensure module code cannot silently violate `_AI_MASTER_RULES.md`.

---

# 2. MODULE DIRECTORY LAYOUT

Each module lives under exactly two locations:

### 2.1 Repository-Side (Immutable)
Path (required):
```
app-repo/specs/modules/<moduleName>/
```

Must contain:
- `<moduleName>_SPEC.md` (the human-readable authoritative spec)
- `crossref/ai-library-index.json` (machine-readable metadata)
- Optional:
  - schema definitions  
  - validation scripts  
  - migration documents  
  - module diagrams  

Repository rules:
- **Immutable at runtime**
- Version-controlled
- Only modified through human-approved PRs

---

### 2.2 Runtime-Side (Mutable)
Path:
```
STORAGE_ROOT/modules/<moduleName>/
```

May contain:
- runtime-generated data  
- module-level caches  
- module state files  
- per-project module data  

Runtime rules:
- **Never** contains specs  
- **Never** contains authoritative definitions  
- AI MUST NOT write or modify anything under `app-repo/specs/modules/...` during runtime  
- AI may modify runtime data *only according to this spec*

---

# 3. MODULE STANDARD SPEC FILE (AUTHORITATIVE)

Each module must include a single canonical markdown file:

```
app-repo/specs/modules/<moduleName>/<moduleName>_SPEC.md
```

This file defines:

1. **Purpose & Scope**  
2. **Interfaces**  
3. **Commands & Tools**  
4. **Storage Requirements**  
5. **Capabilities**  
6. **Dependencies**  
7. **Security Constraints**  
8. **Version & Migration Rules**  
9. **AI Safety Boundaries**  
10. **STOP conditions**  

AI must treat this file as **law** when interacting with the module.

---

# 4. MODULE METADATA (MACHINE-READABLE)

Each module must include:

```
app-repo/specs/modules/<moduleName>/crossref/ai-library-index.json
```

Required fields:
```json
{
  "name": "moduleName",
  "version": "1.0.0",
  "schemaVersion": "1.0.0",
  "dependencies": ["otherModuleA", "otherModuleB"],
  "capabilities": ["map-tools", "sketch-tools"],
  "entrypoints": {
    "api": "./api",
    "ui": "./ui",
    "migrations": "./migrations"
  },
  "dangerous": false
}
```

Rules:
- No circular dependencies.  
- Dependencies must exist and be loadable.  
- Capabilities must be listed in `_AI_MASTER_RULES.md` if they affect global invariants.  
- Version must follow semantic versioning.  
- `dangerous: true` flags modules requiring two-human approval for activation.

---

# 5. MODULE ENABLE/DISABLE RULES

Modules may be:
- **factory-enabled**  
- **server-enabled**  
- **project-enabled**  

Enable flow (all must be satisfied):
```
1. Exists in repo
2. Valid metadata
3. Dependencies enabled
4. Migrations applied
5. Security rules passed
```

Disable rules:
- A module may be disabled only if no other enabled modules depend on it.  
- Disabling a module must not delete user data unless explicitly approved and migration exists.

AI may propose enable/disable operations **but never execute without user confirmation**.

---

# 6. DEPENDENCY RULES

### 6.1 Hard Dependencies
A module cannot function without its dependencies.

Example:
```
CAD-Tools depends on Geometry
```

### 6.2 Soft Dependencies
Optional performance or UI enhancements.

Example:
```
Sketch-Annotations optionally integrates with File-Upload
```

### 6.3 Forbidden Dependencies
If defined in `_AI_MASTER_RULES.md`.

### 6.4 Cycles
Strictly forbidden.

AI must STOP if it detects or would create a dependency cycle.

---

# 7. MODULE CAPABILITIES

Capabilities describe “what this module can do”.

Examples:
- `map-editing`  
- `sketch-editing`  
- `routing-services`  
- `ocr-processing`  
- `ai-automation`  
- `file-ingestion`  
- `gps-calibration`  

Every module’s capabilities must:
- Be explicitly declared  
- Not overlap contradictorily  
- Be validated against backend code  

AI must not infer capabilities that are missing in metadata.

---

# 8. MIGRATION RULES

When a module changes version:
- Migrations must live under:
```
app-repo/specs/modules/<moduleName>/migrations/
```
- Each migration must declare:
  - From version  
  - To version  
  - Required DB changes  
  - Required file changes  
  - Rollback rules  

AI must not perform migrations without:
1. A migration file  
2. User approval  
3. Snapshot of affected data  
4. Crossref consistency validation  

---

# 9. MODULE VALIDATION RULES

Before enabling a module, backend must verify:

1. Spec file exists and passes lint  
2. Metadata validates against schema  
3. Dependencies satisfied  
4. Storage-safe (follows `_AI_STORAGE_ARCHITECTURE.md`)  
5. No conflicts with:
   - UI system spec  
   - Master rules  
   - Templates & defaults  

Static validation failures must block enablement.

---

# 10. AI AGENT BOUNDARIES (EXTREMELY STRICT)

AI agents must **never**:

- Create a module without:
  - spec  
  - metadata  
  - directory structure

- Delete modules  
- Modify repository modules at runtime  
- Bypass validation  
- Add capabilities not defined in metadata  
- Add dependencies implicitly  
- Touch migrations without human approval  
- Modify module specs unless explicitly instructed through:
  - PR flow  
  - human request  
  - destructive-change.json (when needed)

---

# 11. STOP CONDITIONS

AI MUST STOP if:

- Metadata missing or malformed  
- Spec missing  
- Capability undefined  
- Dependency unclear  
- Module referring to unknown capability  
- User request ambiguous about:
  - enabling  
  - disabling  
  - modifying  
- Operation would break dependency graph  
- Operation requires a migration but none exists  
- Operation touches a “dangerous module” without approvals  
- Module requires global invariants that are not present  

STOP means:
- Do nothing  
- Ask for clarification  
- NEVER guess  

---

# 12. VERSIONING RULES

Follow semantic versioning:
- **MAJOR** = breaking changes  
- **MINOR** = new safe features  
- **PATCH** = backward-compatible fixes  

AI must not bump versions unless:
- A human approves  
- A migration file exists (if needed)  
- Changes are consistent with all specs  

---

# 13. MODULE LIFECYCLE

States:
- `unavailable` (repo missing)  
- `available`  
- `validated`  
- `enabled`  
- `active`  
- `error`  

AI may request:
- transitions between states  
- re-validation  
- dependency checks  

AI must never force state changes.

---

# 14. SECURITY AND SANDBOXING

Modules may not:
- access out-of-scope storage  
- modify files outside allowed runtime folder  
- override global roles  
- bypass UI security  
- introduce unsafe migrations  

Modules running custom code must run in:
- sandbox  
- isolated worker  
- restricted environment  

---

# 15. RELATION TO OTHER SPECS

This document is bound by:

- `_AI_MASTER_RULES.md`  
- `_AI_STORAGE_ARCHITECTURE.md`  
- `_AI_ROLES_AND_PERMISSIONS.md`  
- `_AI_UI_SYSTEM_SPEC.md`  
- `_AI_TEMPLATES_AND_DEFAULTS.md`  
- `_AI_FILE_AND_IMAGE_PIPELINE_SPEC.md`  

In case of conflict:
1. `_AI_MASTER_RULES.md` wins  
2. `_AI_STORAGE_ARCHITECTURE.md`  
3. Role & Permission spec  
4. Module spec  

---

# 16. END OF DOCUMENT

This document is authoritative.  
All agents and backend code MUST follow it exactly.

