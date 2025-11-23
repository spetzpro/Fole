# _AI_AUTOMATION_ENGINE_SPEC.md  
Version: 1.0.0  
Last Updated: 2025-11-23  
Status: Authoritative Specification (SSOT)

# AI Automation Engine Specification  
Defines how automated tasks, scheduled jobs, AI-driven operations, and approval workflows behave inside FOLE.

This document governs:
- Automation execution  
- Safety gating  
- Scheduling  
- Human approval flows  
- Permissions  
- Resource limits  
- Required metadata  
- STOP conditions  

Binding for:
- All AI agents  
- Backend automation engine  
- Server orchestrators  
- Module automations  

---

# 1. PURPOSE & SCOPE

The automation engine must:

1. Guarantee **deterministic**, **safe**, **auditable** automation execution.  
2. Prevent AI from performing destructive operations without human review.  
3. Enforce strict **permission**, **role**, and **resource constraints**.  
4. Provide a predictable scheduling model.  
5. Ensure governance rules (_AI_MASTER_RULES.md_) are followed.  
6. Track metadata, authorship, and change provenance.  
7. Prevent runaway or recursive automations.  

Covers:
- Scheduled jobs  
- One-off tasks  
- AI-initiated automation proposals  
- Human-approved destructive actions  
- Module-level automation integrations  

---

# 2. AUTOMATION TYPES

The system supports:

### 2.1 One-Off Tasks
Executed exactly once.
Examples:
- "Import this file"
- "Rebuild tiles"
- "Apply template"

### 2.2 Scheduled Jobs
Cron-like or human-scheduled periodic tasks.

### 2.3 Triggered Automations
Fired by events:
- file uploaded  
- map changed  
- project created  
- calibration updated  

### 2.4 AI-Proposed Automations  
Agents propose tasks; human approves or rejects.

### 2.5 Unsafe / Destructive Automations  
Anything requiring:
- schema change  
- bulk delete  
- migration  
- cross-project rewrite  
- role revocation  
→ requires multi-human approval using destructive-change.json.

---

# 3. AUTOMATION STATE MACHINE

Automations must follow these states:

```
draft → pendingApproval → scheduled → running → completed
                                   ↘
                                    error
```

Definitions:

- **draft** – created by AI or user, not yet approved  
- **pendingApproval** – awaiting human review  
- **scheduled** – queued for execution  
- **running** – actively executing  
- **completed** – finished successfully  
- **error** – failed due to runtime or safety violation  

State transitions must be atomic and logged.

---

# 4. PERMISSION & ROLE RULES

Automation execution must respect:

- `_AI_ROLES_AND_PERMISSIONS.md`  
- Project scoping rules  
- Sysadmin / ProjectOwner / ProjectAdmin boundaries  
- No automatic privilege escalation  

Rules:
1. AI must never run automation requiring permissions the user does not have.  
2. Project-level automation cannot escape project scope.  
3. Sysadmin may run global automation, but still must follow approval requirements.  

---

# 5. METADATA REQUIREMENTS (MANDATORY)

Every automation must contain:

```
id
type
createdBy
createdAt
projectId (nullable)
permissionsRequired
estimatedCost (CPU/memory/time)
dangerous (boolean)
affectsStorage (boolean)
affectsSchema (boolean)
needsApproval (true/false)
inputs
dryRunAvailable (true/false)
```

If `dangerous = true`, then:
- needsApproval MUST be true  
- destructive-change.json MUST be provided  

If `affectsSchema = true`, then:
- requires two-human approval  
- requires migration plan  

---

# 6. APPROVAL RULES

AI cannot approve automations.

Approval paths:

### 6.1 Normal Automation
Needs:
- One human approval  
- Confirmation of parameters  

### 6.2 Dangerous Automation
Requires:
- destructive-change.json  
- Two human approvals  
- Optional rollback plan  
- AI MUST STOP if template/spec/migration missing  

### 6.3 Forbidden Actions
Cannot be automated:
- Cross-project data merges  
- Unauthorized module installation  
- Role or permission escalation  
- Manual DB edits  
- Backend executable uploads  

---

# 7. SCHEDULING MODEL

Schedules use a normalized format:

```
once / hourly / daily / weekly / cron / event-triggered
```

Engine must normalize:
- Timezone  
- DST-safe execution  
- Retry strategy  

Limits:
- Max parallel jobs: configurable  
- Job queue bounded  
- Per-project rate limits  
- Sysadmin override available  
- AI cannot override throttle limits  

Scheduling must be **idempotent**, even after server restart.

---

# 8. RESOURCE SAFETY

Every automation must define:
- maxRuntimeSeconds  
- maxMemoryMB  
- maxCpuPercent  
- diskWriteLimitMB  
- networkAccess: allowed/denied  

Runtime behavior:
- Exceeding limits → immediate termination  
- Termination sets state = `error`  
- AI must not attempt auto-retry unless retry policy exists  

---

# 9. MODULE AUTOMATION RULES

Modules may declare:

```
automations/
  - <automationName>.json
  - <automationName>.md
```

Rules:
- Each automation requires spec + metadata  
- Must declare dependency on required module version  
- AI cannot run module automation unless module is enabled  
- Module automations may NOT exceed module’s capability scope  

---

# 10. AI BEHAVIOR RULES (CRITICAL)

AI agents must:

### 10.1 MUST
- Load this spec before proposing any automation  
- Produce valid structured metadata  
- Declare whether the automation is dangerous  
- Ensure user has required permissions  
- Provide a dry-run option when possible  
- Ask for clarification if ambiguity exists  

### 10.2 MUST NOT
- Execute an automation without explicit user approval  
- Auto-run destructive actions  
- Resolve ambiguity independently  
- “Guess” missing parameters  
- Force-enable modules to allow a job to run  
- Edit backend code or DB directly  

### 10.3 STOP CONDITIONS
AI MUST STOP if:
- automation type unclear  
- permissions unclear  
- module missing  
- dependency not satisfied  
- destructive-change.json missing  
- storage rules unclear (_AI_STORAGE_ARCHITECTURE_)  
- map/tool/template interaction ambiguous  
- user intent unclear  

STOP =  
Do not run. Do not modify. Ask the user.

---

# 11. LOGGING & AUDIT TRAIL

Every automation must log:

- who created  
- who approved  
- why executed  
- inputs  
- outputs  
- resource usage  
- errors  
- downstream effects  

Logs must be immutable.

Audit logs must be included in:
- project export  
- server export  

---

# 12. CANCELLATION & FAILURE POLICY

### Cancellation
- Allowed if job is cancellable  
- Partial changes must be rolled back if possible  
- If rollback impossible → mark partial and notify  

### Failure
On failure, engine must log:
- error type  
- safety violations  
- missing dependencies  
- corrupted inputs  

AI must not retry automatically unless policy explicitly says so.

---

# 13. RELATION TO OTHER SPECS

Automation engine interacts with:

- `_AI_MASTER_RULES.md` (governance, STOP rules)  
- `_AI_STORAGE_ARCHITECTURE.md` (atomic writes, migrations)  
- `_AI_ROLES_AND_PERMISSIONS.md` (permissions)  
- `_AI_TEMPLATES_AND_DEFAULTS.md` (template updates)  
- `_AI_UI_SYSTEM_SPEC.md` (UI-driven actions)  
- `_AI_FILE_AND_IMAGE_PIPELINE_SPEC.md` (file/image operations)  

If conflicts occur:
1. `_AI_MASTER_RULES.md` overrides  
2. Storage rules override  
3. Permission rules override  
4. Automation spec next  

---

# 14. END OF DOCUMENT

This automation engine spec is authoritative.  
All AI agents and backend systems MUST follow it exactly.
