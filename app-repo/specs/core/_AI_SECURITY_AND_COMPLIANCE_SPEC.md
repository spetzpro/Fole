# _AI_SECURITY_AND_COMPLIANCE_SPEC.md  
Version: 1.0.0  
Last-Updated: 2025-11-23  
Status: Authoritative Specification (SSOT)

# AI Security & Compliance Specification  
Defines all rules, safeguards, cryptographic requirements, compliance obligations, data-handling constraints, and AI-behavior safety measures for the FOLE platform.

This file is binding for:
- All AI agents  
- All backend services  
- All modules  
- All developers and administrators  
- CI/CD pipelines  

This spec integrates with:
- _AI_MASTER_RULES.md  
- _AI_STORAGE_ARCHITECTURE.md  
- _AI_ROLES_AND_PERMISSIONS.md  
- _AI_AUTOMATION_ENGINE_SPEC.md  
- _AI_MONITORING_AND_ALERTING_SPEC.md  

---

# 1. PURPOSE & SCOPE

This document exists to:

1. Protect user data from corruption, unauthorized access, leakage, or misuse.  
2. Ensure FOLE complies with standard modern security expectations:  
   - encryption  
   - audit trails  
   - identity & access control  
   - safe logging  
   - safe file operations  
3. Constrain AI agents so they **never violate security boundaries**, **never leak sensitive data**, **never escalate privileges**, and **never bypass rules**.  
4. Provide deterministic security rules that backend code must apply and AI must respect.  

Applies to:
- data storage  
- authentication  
- authorization  
- file handling  
- logs  
- project isolation  
- deletion rules  
- compliance exports  
- AI enforcement  

---

# 2. SECURITY PRINCIPLES

1. **Zero Trust by Default**  
   Every request, every module, every automation must be permission-checked.

2. **Least Privilege**  
   No user, module, or AI agent receives permissions beyond what it strictly needs.

3. **Immutable Auditability**  
   All sensitive operations must produce permanent audit logs.

4. **Isolation**  
   Projects are strictly isolated. No cross-project reads unless explicitly granted.

5. **Fail Closed**  
   On uncertainty, failure, ambiguity, or missing context → **deny and ask**.

6. **Deterministic Behavior**  
   Rules must be explicit so AI cannot “guess intent.”

7. **Separation of Duties**  
   Destructive, dangerous, or high-impact operations require multi-human approval.

---

# 3. AUTHENTICATION REQUIREMENTS

### 3.1 Identity Providers  
The backend MAY support:
- username/password  
- SSO / OAuth2 / OIDC  
- enterprise SSO (SAML2 optional)  

AI must never:
- generate fake auth tokens  
- bypass authentication  
- modify auth configuration without explicit approval  

### 3.2 Password Rules
If password-based auth is used:
- Minimum length: 12  
- Must include uppercase, lowercase, number, symbol  
- Hash algorithm: Argon2id (required)  
- Salt: 16+ bytes  
- Pepper: optional, stored server-side  

AI must never:
- suggest weakening these rules  
- edit password policies without approval  

### 3.3 Session Handling
- JWT tokens must use HS256 or RS256  
- Expiry: 24h max  
- Refresh tokens must be rotated securely  
- Sessions must be invalidated on logout  

---

# 4. AUTHORIZATION RULES

### 4.1 Enforcement
Authorization MUST use:
- _AI_ROLES_AND_PERMISSIONS.md  
- Project membership rules  
- No implicit privilege escalation  

### 4.2 Cross-Project Boundaries
Cross-project access is **forbidden** unless:
- the user has a role in each project  
- or is SysAdmin (global operations only)

AI must not infer access; it must verify.

---

# 5. PROJECT & DATA ISOLATION

Each project is a fully separate security domain.

Rules:
1. Storage directory per project (enforced by _AI_STORAGE_ARCHITECTURE.md)  
2. Project DBs cannot reference other project DBs  
3. AI cannot propose cross-project data merges  
4. Exporting one project must not leak data from another  
5. Automation jobs must stay inside the project unless explicitly marked global  

---

# 6. DATA CLASSIFICATION MODEL

### 6.1 Classification Levels

| Level | Description | Examples |
|-------|-------------|----------|
| Public | safe to share | public templates |
| Internal | non-sensitive project data | map tiles, layers |
| Sensitive | user info, sketches, comments | project metadata, uploaded files |
| Critical | auth tokens, keys, DB internals | encryption keys, system configs |

### 6.2 Mandatory Handling
- Critical data encrypted at rest  
- Sensitive and Critical always require permission checks  
- AI agents must never output Sensitive or Critical data unless user explicitly asks  

---

# 7. ENCRYPTION REQUIREMENTS

### 7.1 At Rest
- FS-level or SQLite encryption optional but recommended  
- Backups containing Sensitive or Critical data must be encrypted  
- AES-256-GCM or XChaCha20-Poly1305 required  

### 7.2 In Transit
All connections MUST use TLS 1.3.

AI may not:
- generate sample code using insecure cipher suites  
- suggest disabling TLS verification  

---

# 8. FILE & IMAGE SECURITY

From _AI_FILE_AND_IMAGE_PIPELINE_SPEC.md_, plus:

1. Files must be scanned for MIME type mismatch  
2. PDF/PSD/ZIP/etc must be sanitized before processing  
3. Images with embedded scripts/macros are forbidden  
4. AI must never recommend disabling sandboxing  
5. Maximum file size must be enforced  
6. Normalize filenames (no directory traversal, no "..")  

Forbidden:
- Executable uploads  
- Inline JS in PDF forms  
- Unscanned ZIP archives  

---

# 9. LOGGING & AUDIT COMPLIANCE

### 9.1 Required Log Types
- Authentication logs  
- Authorization events  
- File imports / exports  
- Automation runs  
- AI STOP events  
- Storage-level destructive operations  

### 9.2 Log Rules
1. Logs must be immutable  
2. Logs must never store plaintext passwords  
3. Sensitive fields must be masked  
4. Logs must be included in project exports  

### 9.3 AI Log Rules
AI must:
- log all STOP reasons  
- log when a user rejects ambiguity  
- never alter, delete, or anonymize logs unless asked  

---

# 10. COMPLIANCE MODES

The system must support operator-configurable compliance modes:

### 10.1 Standard Mode
Default; minimal restrictions.

### 10.2 Strict Mode
- stronger password rules  
- shorter token expiry  
- mandatory 2FA  
- tighter file limits  
- requires explicit user approval for all AI code generation involving data  

### 10.3 Audit Mode
- logs full user provenance  
- blocks all destructive operations unless approved  

AI must detect and respect active mode.

---

# 11. DELETION & RETENTION RULES

### 11.1 Soft Delete
Default: items are recoverable for X days.

### 11.2 Hard Delete
Irreversible; must require:
- identity confirmation  
- explicit permission  
- log entry  

AI must STOP if deletion intent is ambiguous.

### 11.3 Retention
- Logs retained >= 180 days  
- Backups retained >= configurable window  
- Project exports immutable once created  

---

# 12. SECURITY INCIDENT HANDLING

A “security incident” includes:
- unauthorized access  
- corruption  
- privilege escalation attempt  
- AI misuse  
- data leakage  
- failed integrity checks  

When detected:
1. Set system into **Degraded Mode**  
2. Block dangerous automations  
3. AI must STOP all aggressive operations  
4. Require explicit sysadmin override to resume normal behavior  

---

# 13. AI-SPECIFIC SECURITY BEHAVIOR

AI MUST:

- Enforce all STOP rules from _AI_MASTER_RULES.md_  
- Validate permissions before any modification  
- Ask before exposing any sensitive data  
- Verify all storage paths using _AI_STORAGE_ARCHITECTURE.md_  
- Refuse ambiguous requests  
- Refuse to bypass security restrictions  
- Reject cross-project actions without explicit approval  

AI MUST NOT:
- generate database schema edits without governance  
- output user tokens, credentials, or raw secrets  
- leak Sensitive or Critical data  
- suggest weakening encryption or permissions  
- patch backend security code  
- create new roles without spec compliance  

---

# 14. MODULE SECURITY REQUIREMENTS

Each module MUST declare:
```
moduleSecurity.json
{
  "permissionsRequired": [...],
  "sensitiveData": [...],
  "criticalData": [...],
  "exportsAllowed": true|false
}
```

Modules MUST NOT:
- store secrets inside code  
- access outside their project  
- alter global templates  

---

# 15. INTEGRATION WITH OTHER SPECS

Conflicts resolve in this priority:

1. _AI_MASTER_RULES.md_ (governance)  
2. _AI_SECURITY_AND_COMPLIANCE_SPEC.md_ (this file)  
3. _AI_STORAGE_ARCHITECTURE.md_  
4. _AI_ROLES_AND_PERMISSIONS.md_  
5. Module-specific specs  

---

# 16. END OF DOCUMENT

_AI_SECURITY_AND_COMPLIANCE_SPEC.md  
This document is authoritative.  
All AI agents and backend services MUST follow it exactly.
