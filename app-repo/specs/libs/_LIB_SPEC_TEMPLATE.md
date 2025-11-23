# Version: SPEC_V1.0  
Last-Updated: 2025-11-23  
Status: Draft / Active / Deprecated

# <LIB_NAME> Library Specification
Narrow, shared helper library used by one or more modules/blocks.

This document defines:
- The purpose and narrow responsibility of this library
- Its public API surface (functions, types, helpers)
- Which core specs and modules it must follow
- AI usage and STOP rules for this library

---

## 1. Purpose & Scope

1.1 Purpose  
- One short paragraph: what this library does and why it exists.

1.2 In-Scope  
- Bullet list of responsibilities this library **does** own.

1.3 Out-of-Scope  
- Bullet list of concerns this library **explicitly does NOT** own (delegated to modules/blocks).

---

## 2. Public API

List the functions, types, or helpers this library exposes.

- **Function / Helper:** `<name>`
  - Purpose:
  - Inputs:
  - Outputs:
  - Invariants / guarantees:

Add additional entries as needed.

---

## 3. Dependencies

3.1 Core Spec Dependencies  
This library is constrained by (add/remove as appropriate):

- `_AI_TEMPLATES_AND_DEFAULTS.md`
- `_AI_STORAGE_ARCHITECTURE.md` (if it touches storage)
- `_AI_DB_AND_DATA_MODELS_SPEC.md` (if it touches DB)
- `_AI_ERROR_HANDLING_AND_DIAGNOSTICS_SPEC.md` (if it wraps error handling)

3.2 Module / Block Usage  
- Modules or blocks that are expected to use this library.
- Any constraints to avoid circular dependencies.

---

## 4. AI Usage Notes / STOP Rules

4.1 Required Context for AI  
Before an AI agent modifies this library, it MUST load:

- `_AI_MASTER_RULES.md`
- `_AI_CONTEXT_MAP.md`
- This library spec
- Relevant core specs from Section 3.1
- Specs for modules/blocks that depend on this library (if changes may affect them)

4.2 Allowed Transformations  
AI may:

- Refactor internal implementation while preserving the public API defined here.
- Improve performance without changing observable behavior.
- Add tests or documentation to better cover invariants.

4.3 Forbidden Actions / STOP Rules  
AI MUST STOP and ask a human if:

- A change would alter the library’s public API or behavior used by multiple modules/blocks.
- A change would implicitly alter DB schema or STORAGE_ROOT layout (those belong in module specs).
- Requirements conflict with depending module/block specs or core specs.

---

## 5. Open Questions / TODOs

- [ ] Question / ambiguity 1
- [ ] Question / ambiguity 2

End of `<LIB_NAME>` library specification.
