# FOLE — Field Operations, Layout & Engineering

FOLE is a modular web platform for mapping, sketching, documentation, and project coordination.  
It provides:
- Interactive maps and calibrated floorplans  
- Technical sketching tools with custom feature sets  
- Project-structured storage and role-based permissions  
- A fully window-based, flexible UI  
- Modular extensions for specialized workflows  

FOLE is designed for precision, collaboration, and extensibility — from simple markup to complex technical documentation.

---

## Core concurrency

FOLE’s core uses a lock manager abstraction to coordinate access to files and databases
(including DAL-backed locks and optional in-memory lock diagnostics). For details, see:

- `app-repo/specs/core/_AI_CONCURRENCY_AND_LOCKING_SPEC.md`
- `app-repo/src/core/concurrency/LockManager.ts`

---

## Tracking progress

For development order and core implementation progress,
see app-repo/specs/core/_AI_CORE_BUILD_ROADMAP.md.

## AI Governance

For AI-assisted changes, **all agents MUST** obey:

- `app-repo/docs/ai/_AI_MASTER_RULES.md`  
- `app-repo/docs/ai/_AI_CONTEXT_MAP.md`  

These define what context to load, what rules apply, and strict STOP conditions to ensure safe, deterministic behavior.

---

## AI Prompting

For prompting AI in Visual Studio Code, use this to keep the AI on course with the spec files:

When working in this repo, you must obey `app-repo/docs/ai/_AI_MASTER_RULES.md` and use `app-repo/docs/ai/_AI_CONTEXT_MAP.md` + `app-repo/docs/ai/ai-docs-index.json` to decide which specs to load.

All core specs follow the `_AI_*.md` naming pattern and live under `app-repo/specs/core/`.

Before proposing code or spec edits, always load the relevant `_AI_*.md` core spec(s) from `app-repo/specs/core/`. Do not invent new patterns or bypass storage/auth/roles rules defined there.

End of `README.md`