
# _AI_ERROR_HANDLING_AND_DIAGNOSTICS_SPEC.md
Version: 1.0.0  
Last-Updated: 2025-11-23  
Status: Authoritative Specification (SSOT)

# AI Error Handling & Diagnostics Specification  
Defines how FOLE detects, classifies, reports, logs, and recovers from errors — for both backend services and AI agents.

This document standardizes:
- Error classes  
- Diagnostic reporting  
- Recovery behavior  
- AI STOP rules  
- Structured error envelopes  
- Logging and traceability  
- How modules must surface errors  
- How AI must respond to them  

This spec is **binding** for backend services, all modules, all AI agents, and the automation engine.

---

# 1. PURPOSE

The error‑handling system must ensure:

1. **Safety** — errors never lead to silent corruption.  
2. **Determinism** — errors are classified the same way everywhere.  
3. **Observability** — diagnostics always expose enough context.  
4. **AI correctness** — AI must not guess around failures.  
5. **Structured output** — errors must always follow the same schema.  
6. **Recoverability** — all recoverable errors must be recoverable.  
7. **Isolation** — module-specific failures must not cascade.  

---

# 2. ERROR CLASSES (MANDATORY)

All errors MUST be assigned one and only one of these classes:

## 2.1 `VALIDATION_ERROR`
- Invalid user input  
- Schema mismatch  
- Missing required fields  
- Bad JSON  
- Invalid file type  

AI RULE: **STOP** and request user correction.

## 2.2 `PERMISSION_DENIED`
- User lacks required permission per `_AI_ROLES_AND_PERMISSIONS.md`

AI RULE:  
**Do not retry.  
Do not suggest bypassing.  
Tell user they lack permissions.**

## 2.3 `NOT_FOUND`
- Project/map/file/DB row does not exist.  

AI RULE: STOP and ask for clarification.

## 2.4 `CONFLICT`
- Race condition  
- Edit collision  
- Version mismatch  
- Overlapping writes  

AI RULE:  
Attempt a **safe retry** only if the spec allows.  
Otherwise STOP.

## 2.5 `RATE_LIMITED`
- Too many operations  
- Project exceeded quotas  
- Module-specific throttling  

AI RULE:  
Inform user.  
DO NOT retry automatically.

## 2.6 `RESOURCE_EXCEEDED`
- CPU, memory, disk limits exceeded  
- Automation exceeded quota  
- Tile generation overrun  

AI RULE:  
STOP. Ask user whether to attempt again with different parameters.

## 2.7 `STORAGE_ERROR`
Defined by `_AI_STORAGE_ARCHITECTURE.md`:
- Fsync failure  
- Rename failure  
- WAL checkpoint failure  
- DB locked  
- Filesystem full  

AI RULE:  
STOP.  
Never continue after a storage error.  
Ask user to resolve disk/permission issues.

## 2.8 `NETWORK_ERROR`
For deployments using remote object stores:
- S3/GCS failures  
- Timeout  
- TLS error  

AI RULE:  
Retry **only** if the backend indicates retryable via error field.

## 2.9 `MODULE_ERROR`
A module surfaced an internal error.  
Modules MUST expose:

```
code
module
message
diagnostic
recoverable: true/false
```

AI RULE:  
If recoverable: attempt safe retry.  
If not recoverable: STOP.

## 2.10 `FATAL`
- Corruption  
- Internal invariants violated  
- Impossible states  
- Recursive automation detected  
- Unauthorized privilege escalation attempt  

AI RULE:  
STOP immediately.  
Do not retry.  
Inform user.

---

# 3. ERROR ENVELOPE FORMAT (REQUIRED)

Every error returned by backend MUST follow:

```json
{
  "error": true,
  "class": "VALIDATION_ERROR",
  "code": "PROJECT_NAME_INVALID",
  "message": "Project name cannot contain special characters.",
  "context": {
    "projectId": "abc123"
  },
  "recoverable": false,
  "retry": false,
  "traceId": "uuid",
  "timestamp": "2025-11-23T12:30:00Z"
}
```

Fields:
- `class` — one of Section 2  
- `code` — stable machine-readable string  
- `message` — human explanation  
- `context` — structured metadata  
- `recoverable` — can user retry?  
- `retry` — may backend safely retry?  
- `traceId` — links to logs  

---

# 4. AI AGENT RULES

AI MUST:

1. Load this spec before interpreting any error.  
2. Use `class` to decide behavior — never infer from wording.  
3. STOP if:  
   - class is unknown  
   - retry semantics unclear  
   - permissions insufficient  
   - storage error occurred  
   - fatal error occurred  
4. Never generate made‑up recovery steps.  
5. Never bypass permission-denied errors.  
6. If the error refers to a spec area (storage, roles, templates, geo, image pipeline):  
   Load that spec and apply rules.  

AI MAY:
- Offer corrected input for validation errors.  
- Propose non-destructive recoverable operations.  

AI MUST NOT:
- Auto-create missing resources unless user asked.  
- Retry destructive operations.  
- Retry after storage errors.  

---

# 5. DIAGNOSTIC CONTEXT RULES

Every backend operation MUST produce diagnostics containing:

- operation name  
- target resource  
- duration  
- parameters  
- db queries executed  
- file operations executed  
- module invoked  
- success/failure  
- traceId  

Diagnostics must be stored in:
- automation logs  
- per-project logs  
- server audit logs  

---

# 6. LOGGING REQUIREMENTS

Logs MUST contain:
- timestamp  
- severity  
- module  
- action  
- message  
- traceId  
- userId (nullable)  

Logs MUST be:
- immutable  
- append-only  
- included in server exports  

Logs MUST NOT contain:
- passwords  
- tokens  
- raw OAuth secrets  
- binary blobs  

---

# 7. DEBUG & VERBOSE MODES

Two modes:

## 7.1 Debug Mode
Includes:
- SQL statements  
- file paths  
- module diagnostics  

NEVER enabled in production unless explicitly turned on by sysadmin.

## 7.2 Verbose Mode
Includes:
- high-level events  
- performance metrics  
- module summaries  

Safe for production.

---

# 8. RECOVERY RULES

8.1 Recoverable Errors
- module recoverable error  
- retryable network error  
- conflict retry  
AI may assist user.

8.2 Non‑Recoverable Errors
- storage error  
- fatal error  
- permission denied  
- corrupted DB  

AI must STOP.

---

# 9. STOP CONDITIONS

AI MUST STOP when:

- error class unknown  
- retry allowed? unclear  
- operation ambiguous  
- missing required approvals  
- spec conflict  
- destructive recovery step needed  
- storage invariant violated  

STOP means:
- Do not retry  
- Do not guess  
- Ask user  

---

# 10. RELATION TO OTHER SPECS

This spec relies on:

- `_AI_STORAGE_ARCHITECTURE.md`  
- `_AI_ROLES_AND_PERMISSIONS.md`  
- `_AI_GEO_AND_CALIBRATION_SPEC.md`  
- `_AI_TEMPLATES_AND_DEFAULTS.md`  
- `_AI_MODULE_SYSTEM_SPEC.md`  

If conflict:
1. `_AI_MASTER_RULES.md` overrides  
2. Storage spec overrides this  
3. Permissions spec overrides module errors  

---

END OF DOCUMENT  
_AI_ERROR_HANDLING_AND_DIAGNOSTICS_SPEC.md
