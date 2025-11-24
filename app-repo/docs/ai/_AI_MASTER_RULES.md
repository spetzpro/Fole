# Version: SPEC_V1.0
Last-Updated: 2025-11-23

# AI MASTER RULES  
Authoritative Governance for All AI Agents Working on This Repository

This document defines the non-negotiable rules that govern how any AI system interacts with this codebase and its associated data.  
These rules override all other instructions unless explicitly superseded by a human.

The objectives are:
- Prevent data loss  
- Maintain spec/code consistency  
- Enforce safe automation  
- Ensure modular integrity  
- Guarantee predictable behavior  
- Protect production data  
- Enable reversible operations  
- Provide transparent auditability  

---

# 1. ABSOLUTE PRIORITY RULE

## 1.1 These rules override ALL other instructions
If any prompt, file, or user instruction conflicts with `_AI_MASTER_RULES.md`,  
**these rules win automatically.**

## 1.2 If unsure, ask a human
Uncertainty → STOP → request human clarification.

---

# 2. AUTHORITY & SOURCE OF TRUTH

## 2.1 Documentation overrides code
This repository is **spec-driven**.  
If code and documentation conflict:

**Documentation is the authoritative source of intent. Code must be corrected to match the spec. The spec must NOT be altered to match erroneous code.**

## 2.2 AI may not “choose” interpretations
Specs are binding.  
AI must not reinterpret or bend rules.

AI MUST treat all files labeled `Version: SPEC_V1.x` as following the governance rules in this document. If a file’s version is older or missing, AI must not assume behavioral correctness and must request human direction before making structural or behavioral changes.

## 2.3 Canonical documentation set
The following files ALWAYS constitute the definitive system contract:

- `_AI_MASTER_RULES.md` → `app-repo/docs/ai/_AI_MASTER_RULES.md`  
- `_AI_CONTEXT_MAP.md` → `app-repo/docs/ai/_AI_CONTEXT_MAP.md`  
- `_MODULE_AND_BLOCK_STANDARD.md` → `app-repo/specs/core/_AI_MODULE_SYSTEM_SPEC.md`  
- `_AI_FOLDER_STRUCTURE.md` → `app-repo/specs/core/_AI_STORAGE_ARCHITECTURE.md`  
- `_STORAGE_ARCHITECTURE.md` → `app-repo/specs/core/_AI_STORAGE_ARCHITECTURE.md`  
- `_DB_AND_DATA_MODELS.md` → `app-repo/specs/core/_AI_DB_AND_DATA_MODELS_SPEC.md`  
- `_TEMPLATES_AND_DEFAULTS.md` → `app-repo/specs/core/_AI_TEMPLATES_AND_DEFAULTS.md`  
- `_UI_SYSTEM_SPEC.md` → `app-repo/specs/core/_AI_UI_SYSTEM_SPEC.md`  
- `_ROLES_AND_PERMISSIONS.md` → `app-repo/specs/core/_AI_ROLES_AND_PERMISSIONS.md`  
- `_HUMAN_BACKUP_INSTRUCTIONS.md` → `app-repo/specs/core/_HUMAN_BACKUP_INSTRUCTIONS.md`

If these files conflict with any module/block spec, these files take precedence.

## 2.4 Spec Precedence Order

**Spec Precedence (highest  lowest):**
1. `_AI_MASTER_RULES.md`
2. Core specs (storage, DB, concurrency, auth, templates, etc.)
3. Module specs
4. Library specs (`specs/libs`)
5. Block specs
6. Implementation-level code

When two specs conflict, the higher-level spec overrides the lower.  
AI MUST STOP if encountering an unresolved conflict.

---

# 3. WHAT AI MAY AND MAY NOT DO

## 3.1 Allowed Actions
AI may:
- Write code  
- Update existing `.md` specs (with safety rules)  
- Create new modules/blocks following standards  
- Propose migrations with metadata  
- Modify UI components following `_UI_SYSTEM_SPEC.md`  
- Generate tests, fixtures, docs  
- Refactor code while preserving behavior  
- Create temporary files inside allowed temp zones  
- Interact with the job/operations system  
- Request human approval when needed  

- Local helpers (used only within one module or block) may be refactored for clarity, but:
	- they must remain local,
	- they must not be exposed as public APIs,
	- they must not be moved into shared libs (`specs/libs`) unless explicitly approved by a human.

## 3.2 Conditionally Allowed (Requires Human Signoff or Metadata)
- Schema changes  
- Deleting any file outside temp zones  
- Data migrations  
- Storage structure changes  
- Module/block removal  
- Map tiling pipeline changes  
- Rasterization changes  
- Changes affecting security or permissions  

## 3.3 Strictly Forbidden
AI must NEVER:
- Modify secrets or introduce new secrets  
- Access secrets or environment variables  
- Touch system packages or OS configs  
- Write to arbitrary filesystem locations  
- Break atomic-write patterns  
- Introduce circular dependencies  
- Modify version-controlled factory templates in `/app-repo/templates`  
- Edit anything inside `.git/`  
- Apply destructive operations without metadata + approvals  
- Ignore or bypass the automation kill-switch  

---

# 4. DESTRUCTIVE CHANGE GOVERNANCE (MANDATORY)

Any change that could delete data, rewrite schema, migrate content, or modify persistent state is classified as a **Destructive Change**.

Examples:
- DB schema migrations  
- Changing storage format  
- Deleting or renaming directories under `STORAGE_ROOT`  
- Rewriting tiles, maps, sketches  
- Removing modules/blocks  
- Changing calibration logic  
- Modifying job/queue behavior  

## 4.1 Required metadata file (destructive-change.json)
Any PR containing destructive changes must include **destructive-change.json** at repo root.

It must conform to `tools/ai/destructive-change-schema.json`.

Required fields:
- destructiveType  
- summary  
- author  
- rationale  
- affectedAreas  
- backwardCompatibility  
- mitigationPlan  
- rollbackPlan  
- testPlan  
- approvals  

## 4.2 Required human approval
A destructive-change PR MUST have:

1. **At least one human reviewer approving via GitHub Review**, AND  
2. A block in PR body:

```
APPROVED_BY:
 - <username> <date>
```

## 4.3 Required safety testing
Before applying destructive changes:

- Snapshot test on isolated copy  
- Migration test  
- Rollback test  
- CI must validate JSON schema  
- CI must validate no forbidden folders touched  

---

# 5. AI CONTEXT LOADING RULES

## 5.1 Minimize context
AI must load **only** necessary files — not the entire repo.

## 5.2 Context routing
AI must follow mapping rules in `_AI_CONTEXT_MAP.md`.

Load only:
- current block’s spec  
- shared global specs  
- module-specific notes  
- required Core utilities  

## 5.3 Required context when editing

### Code → must load  
- `_MODULE_AND_BLOCK_STANDARD.md`  
- `_AI_FOLDER_STRUCTURE.md`  
- relevant block/module spec  
- `_ROLES_AND_PERMISSIONS.md` (if permissions involved)  
- `_UI_SYSTEM_SPEC.md` (if UI involved)
 - Shared helper/library specifications under `specs/libs/` MUST be loaded when modifying any code that uses them. Helpers that are only used inside a single module or block remain implementation details and do NOT require a spec. Promoted shared helpers in `specs/libs` must be treated like mini-specs with STOP rules.

### Storage → must load  
- `_STORAGE_ARCHITECTURE.md`

### DB → must load  
- `_DB_AND_DATA_MODELS.md`

### Templates → must load  
- `_TEMPLATES_AND_DEFAULTS.md`

## 5.4 Forbidden context usage
AI must not:
- guess  
- hallucinate missing sections  
- invent new docs  
- rewrite global specs without permission  

**STOP:** AI MUST NOT promote local helpers into `specs/libs` unless:
- The helper is confirmed to be used across multiple modules/blocks, **and**
- A human explicitly requests the promotion.

AI may suggest promotion but MUST NOT perform it automatically.

**STOP:** If a spec or template does not contain a `Version: SPEC_Vx.y` header, or if two files reference conflicting major versions, AI MUST STOP and request human review before modifying behavior or structure.

---

# 6. DOCUMENTATION SYNCHRONIZATION REQUIREMENTS

## 6.1 Any code change affecting behavior MUST update its spec  

Before modifying any spec or template, AI MUST perform a basic consistency check across relevant module, block, and library specs. If the AI detects contradictions or incompatible instructions across specs, it MUST STOP and request human resolution.
If code is changed but relevant `.md` spec is not updated → **PR must fail**.

## 6.2 Specs must never diverge  
Spec + Code must match 1:1.

## 6.3 CI must enforce  
Any PR missing required spec updates MUST be rejected.

---

# 7. KILL SWITCH / AUTOMATION PAUSE

If file exists:

```
STORAGE_ROOT/AI_AUTOMATION_PAUSED
```

Then:

- AI MUST perform no automated actions  
- AI MUST not generate PRs  
- AI MUST not modify repository  
- AI MUST respond:

**“Automation paused by sysadmin; awaiting reactivation.”**

---

# 8. AI ACTION AUDIT REQUIREMENTS

Every automated PR must append one line to:

```
STORAGE_ROOT/core/ai-action-log.jsonl
```

Fields:
- timestamp  
- agentName  
- actionType  
- filesChanged  
- destructiveChange (bool)  
- jobId (optional)  

This file must be **append-only**.

---

# 9. DATABASE & MIGRATION SAFETY

AI MUST follow these rules:

## 9.1 No direct schema edits  
Schema changes require destructive-change.json.

## 9.2 Migrations must be reversible  
Rollback plan MUST exist & be tested.

## 9.3 Test on snapshot  
Migration MUST be safely tested on a DB copy.

## 9.4 Never modify live DB directly  
All changes must:
- go through migration scripts  
- use temp → replace atomic pattern  
- pass CI  

---

# 10. ATOMIC STORAGE RULES

AI must follow the atomic write pattern defined in `_STORAGE_ARCHITECTURE.md`:

1. Write into temp folder  
2. Validate  
3. Atomic rename  
4. Update DB manifest  
5. Commit  

Partial writes are forbidden.

---

# 11. PERFORMANCE & JOB SYSTEM GOVERNANCE

Heavy operations must:
- run through the job system  
- declare expected load  
- respect quotas and concurrency limits  
- never bypass the operations subsystem  

This includes:
- tiling  
- rasterization  
- imports  
- large exports  
- background processing  

---

# 12. PERMISSIONS & SECURITY

AI must:
- use centralized ACL rules  
- follow `_ROLES_AND_PERMISSIONS.md`  
- never bypass permission checks  
- not grant new permissions implicitly 

