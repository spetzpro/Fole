Version: 1.0.0
Last-Updated: 2025-11-23
Status: Authoritative Specification (SSOT)

# _AI_INTEGRATION_AND_EXTENSIBILITY_SPEC.md
AI Integration & Extensibility Specification

This document defines how FOLE integrates with external systems, APIs, plugins, webhooks, extension modules, and external automation.

---

# 1. PURPOSE & SCOPE
FOLE must provide:
- A safe and deterministic integration layer.
- A plugin/module system that cannot break core safety.
- Clear API boundaries for external systems.
- AI-governed STOP rules for ambiguous integrations.
- Secure webhooks and inbound event validation.

This spec covers:
- External APIs
- Webhooks
- Extension modules
- Plugin capabilities & limits
- External orchestration systems
- Third‑party automation integrations

---

# 2. INTEGRATION PRINCIPLES
1. **Security first** — No integration may bypass permission rules.
2. **Deterministic behavior** — No hidden side effects.
3. **Isolation** — Plugins can only access declared capabilities.
4. **Explicit contracts** — No dynamic behavior unless approved.
5. **Compatibility** — Modules must declare version requirements.
6. **Auditability** — All integration activity logged.

---

# 3. EXTENSION MODULE MODEL
Modules live under:
```
app-repo/specs/modules/<moduleName>/
```
Runtime module data lives under:
```
STORAGE_ROOT/modules/<moduleName>/
```

Modules must declare:
- module.json
- capabilities.json
- version requirements
- APIs they expose
- Permissions required

---

# 4. MODULE CAPABILITIES
Capabilities define what a module can do.

Example capability sets:
- “map-tools”
- “file-processing”
- “geo-ops”
- “automation-provider”
- “webhook-producer”
- “webhook-consumer”

Capabilities must be:
- declared in module.json
- validated by backend
- enforced during runtime

AI must never request capabilities not declared.

---

# 5. EXTERNAL API INTEGRATION
External APIs require:
- stable schema
- permission classification
- audit logs
- explicit allowlist

API keys stored only under:
```
STORAGE_ROOT/secrets/
```

AI cannot:
- create external calls without user approval
- store external keys outside secrets
- guess undocumented API schemas

---

# 6. WEBHOOKS
FOLE supports outgoing and incoming webhooks.

## 6.1 Incoming Webhooks
Incoming webhooks must be:
- authenticated (HMAC or OAuth)
- validated against schema
- stored with audit trail
- rate-limited
- mapped to event types

Invalid or ambiguous webhooks → reject + alert.

## 6.2 Outgoing Webhooks
Outgoing webhooks must:
- follow retry policy
- include signed payloads
- be logged with:
  - destination
  - payload hash
  - retry count

---

# 7. EVENT-DRIVEN INTEGRATIONS
Integrations may subscribe to:
- map updates
- file imports
- project creation
- calibration updates
- automation events

Event routing must follow:
_AI_EVENT_SYSTEM_AND_WEBHOOK_SPEC.md

AI must not create new event subscriptions unless module declares support.

---

# 8. PERMISSION RULES
Integrations must follow:
- _AI_ROLES_AND_PERMISSIONS.md
- _AI_SECURITY_AND_COMPLIANCE_SPEC.md

External systems MUST NOT bypass:
- project boundaries
- module boundaries
- user permissions

AI must STOP if:
- integration target unclear
- permission mapping unclear
- data classification unknown

---

# 9. SANDBOXING & SAFETY
Modules run inside a restricted environment.

Sandbox restrictions:
- No raw filesystem access outside module folder.
- No network access unless capability declared.
- No child process execution unless allowed.
- No DB writes except through DAL.

AI must assume **sandbox always enabled**.

---

# 10. VERSIONING & COMPATIBILITY
Modules must declare:
```
foleVersionMin
foleVersionMax
moduleVersion
schemaVersion
```

If incompatible:
- module disabled
- admin alert generated
- AI must STOP suggesting usage

---

# 11. PLUGIN INSTALLATION & UPDATES
### Allowed:
- Install modules signed by trusted authority
- Update modules through admin UI
- Migrate module data using DAL

### Forbidden:
- Installing unsigned modules
- Installing modules from untrusted sources
- Overwriting module.json at runtime

AI must not auto-install modules.

---

# 12. EXTERNAL AUTOMATION INTEGRATIONS
When automating across systems (Zapier, n8n, custom pipelines):

Rules:
1. Read-only access unless permission granted.
2. API rate limits must be respected.
3. Sensitive actions require human approval.
4. Automation proposals follow:
   _AI_AUTOMATION_ENGINE_SPEC.md

---

# 13. ERROR HANDLING
Integrations must follow:
_AI_ERROR_HANDLING_AND_DIAGNOSTICS_SPEC.md

Errors must:
- be logged
- never expose secrets
- include correlation IDs

---

# 14. AUDIT REQUIREMENTS
Every integration must log:
- who initiated
- target system
- payload (hashed)
- response (hashed)
- timestamps
- module source

Logs must be immutable.

---

# 15. AI STOP CONDITIONS
AI MUST STOP if:
- integration unclear
- spec missing
- external API schema unknown
- permissions unclear
- module disabled
- capability missing
- user intent ambiguous

STOP = Do not continue. Ask user.

---

# END OF DOCUMENT
This spec is authoritative. All agents & backend components must follow it exactly.
