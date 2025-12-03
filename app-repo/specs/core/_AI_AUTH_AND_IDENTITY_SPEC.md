Version: 1.0.0
Last-Updated: 2025-11-23
Status: Authoritative Specification (SSOT)

# _AI_AUTH_AND_IDENTITY_SPEC.md
Authentication, identity, sessions, and related security rules for FOLE.

This document defines how FOLE handles:

- User identities
- Passwords and credentials
- Sessions and cookies
- Login, logout, invite and reset flows
- Rate limiting and brute force protection
- Security and privacy rules for auth-related data

It is **binding** for:

- All backend services
- All AI agents
- All admin tools
- Any future auth-related modules

This spec must be implemented consistently with:

- `_AI_MASTER_RULES.md`
- `_AI_STORAGE_ARCHITECTURE.md`
- `_AI_ROLES_AND_PERMISSIONS.md`
- `_AI_SECURITY_AND_COMPLIANCE_SPEC.md`
- `_AI_TEMPLATES_AND_DEFAULTS.md` (for email templates)
- `_AI_UI_SYSTEM_SPEC.md` (for auth-related UI behavior)

---

## 1. PRINCIPLES

1. **Least Privilege**
   - Authentication verifies identity.
   - Authorization is enforced via `_AI_ROLES_AND_PERMISSIONS.md`.
   - No implicit privileges. All access is granted via roles/permissions.

2. **Defense in Depth**
   - Strong password hashing (Argon2id).
   - Hardened session cookies.
   - CSRF protection.
   - Rate limiting and anomaly detection.
   - Session binding and revocation rules.

3. **No Guessing for AI**
   - If any auth-related behavior is ambiguous, undocumented, or conflicting:
     - AI MUST STOP.
     - AI must ask a human for clarification.

4. **GDPR & Privacy by Design**
   - Store minimum necessary personal data.
   - Provide clear deletion/anonymization flows.
   - Never log secrets or raw credentials.

5. **Separation of Concerns**
   - Identity/auth logic is separate from roles/permissions.
   - Backend is the final authority on authentication decisions.

6. **Human Accounts vs Machine Access**
   - Human users authenticate via server-side sessions.
   - Machine and integration access will use tokens (future extension), **not** human credentials.

### 1.5 Current Implementation Status (MVP in this repo)

This spec describes the **full FOLE auth system**, including backend services that are not yet implemented in this repository.

In the current `app-repo` codebase:

- `core.auth` modules provide:
  - `AuthApiClient` — an interface for talking to a backend auth service (no concrete HTTP implementation in this repo).
  - `AuthSessionManager` — an in-memory session manager (no persistent session storage).
  - `AuthStateStore` — a reactive store for auth status + current user (implemented and tested).
  - `CurrentUserProvider` — read-only access to the current user identity (implemented and tested).
- There is **no backend implementation** here for:
  - password hashing,
  - Argon2id configuration,
  - invite flows,
  - password reset flows,
  - rate limiting,
  - session cookies or CSRF.
- The rules in this spec are **binding** for any backend or future auth implementation. The current repo should be treated as a thin client-side/front-end slice that must follow these rules when it eventually talks to a real backend.

AI agents working **within this repo** must:

- Treat this document as the source of truth for **designing** or **interfacing with** backend auth.
- Not assume that Argon2id, invites, or other backend features exist in this codebase yet.
- Use `AuthApiClient` as the boundary to a future backend that will implement these requirements.

---

## 2. IDENTITY MODEL

### 2.1 User Identity Fields (Conceptual)

At minimum, each user has:

- `userId` (internal UUID / numeric id)
- `username` (unique, human-chosen)
- `canonicalUsername` (normalized, lowercased version for uniqueness)
- `email` (optional but required for invite-based creation)
- `userExternalId` (conceptual cross-server identity key; see below)
- `passwordHash` (Argon2id, see section 3)
- `createdAt`
- `lastLoginAt` (nullable)
- `isActive` (boolean)
- `mfaMethod` (nullable: `null`, `totp`, `webauthn`)
- `mfaStatus` (`inactive` | `active` | `setup_required`)
- `flags` (JSON / bitfield for future identity attributes)

The relationship between these fields is:

- `userId` is the **local, internal identifier** for a user on a given
  server. It is opaque and stable within that deployment. In this repo,
  `CurrentUser.id` is this `userId` and is what appears in
  `project_members.user_id` today.
- `email` is the user’s **primary verified email address** for login and
  invite flows. For MVP, email is unique per deployment (or tenant, if
  introduced later).
- `userExternalId` is a **conceptual cross-server identity key**:
  - For email+password auth, it is initially equal to the primary email.
  - For future IdP integrations, it may be set to an IdP subject (e.g. an
    OIDC `sub` claim) or a stable IdP identifier.
  - It is intended to be stable across exports/imports and identity changes
    on a given server, and will be the primary key used for correlating
    imported memberships and accounts.

In all cases:

- `CurrentUser.id` → `userId` (local/internal identifier used in runtime
  permission checks and `project_members.user_id`).
- `CurrentUser.email` → the primary email and a candidate for
  `userExternalId` in the MVP.
- `userExternalId` is the preferred identity for future cross-server
  mapping flows (e.g. when reconciling imported memberships and users).

Any additional profile data (name, organization, phone, etc.) must be:

- Stored separately from core auth fields.
- Treated according to `_AI_SECURITY_AND_COMPLIANCE_SPEC.md` and GDPR rules.

### 2.2 Username Rules

- Usernames must be **globally unique** across the entire deployment.
- Usernames are **case-insensitive** for identity:
  - `canonicalUsername = lowercase(NFC(username))`
  - Uniqueness is enforced on `canonicalUsername`.
- Allowed characters: implementation-defined (must be documented), but **must** exclude clearly dangerous characters (control chars, nulls, unprintables).
- AI MUST NOT invent its own username normalization rules. It must follow the documented normalization behavior.

### 2.3 Email Rules

- Email is optional for admin-created "generic" accounts.
- Email is required for invite-based registration.
- Emails must be validated for syntactic correctness.
- Email uniqueness may be enforced per deployment; this must be configurable.
- Email must never be used as the primary identity key; `userId` + `username` are canonical.

---

## 3. PASSWORDS & HASHING

### 3.1 Password Hash Algorithm

FOLE MUST use **Argon2id** for password hashing, with parameters that meet or exceed contemporary OWASP guidance.

Minimum rules:

- Algorithm: `Argon2id`
- Parameters (example baseline, configurable):
  - `memoryCost`: >= 64 MiB
  - `timeCost`: >= 2 iterations
  - `parallelism`: >= 1
- Hash must be stored in a standard, self-describing string format that includes parameters.
- Password hashes must be stored **only** in server-side storage (DB) and never in logs.

> **Repo note:** This repository does not implement password hashing itself; any backend that handles FOLE auth must implement these rules.

### 3.2 Parameter Upgrades & Rehashing

- If recommended Argon2id parameters change (e.g., more memory or iterations):
  - On successful login, if the stored hash uses old parameters,
    - Server must rehash the password with the new parameters,
    - Then replace the stored hash atomically.
- Any bulk migration of password hashes outside the login path is a **destructive change** and must follow the governance rules in `_AI_MASTER_RULES.md` (destructive-change.json, approvals, rollback plan).

### 3.3 Password Rules

- Minimum length (e.g., 10+ chars); complexity rules may be deployment-specific.
- Long passphrases are preferred over brittle complexity rules.
- Passwords must **never** be logged or stored in plaintext anywhere, including crash dumps and debug logs.
- AI must never suggest storing plaintext passwords in config files, docs, or scripts.

### 3.4 Optional Breached-Password Checks

- Deployments may integrate a breached-password check (e.g., k-anonymity API).
- This is optional and not required for correctness of this spec.
- If enabled, the check must:
  - Never send full password off the server.
  - Treat rejections as policy failures, not as auth failures.

---

## 4. ACCOUNT CREATION & INVITES

There are two ways to create users.

### 4.1 Admin-Created Users (Generic Accounts)

Admins (SysAdmin or ProjectAdmin where allowed) may create users directly from an admin UI:

- Admin enters:
  - `username`
  - `optional email`
  - initial password (or "require reset on first login" flag)
- System verifies:
  - `canonicalUsername` is unique.
- System hashes password using Argon2id and stores the user.

Rules:

- Initial password may have relaxed complexity if admin chooses, but should still meet minimum length.
- Optionally, the account can be marked `requirePasswordChangeOnFirstLogin`.
- AI must not automatically generate trivial passwords; it may propose random passphrases but should default to "require reset" flows for security-critical deployments.

### 4.2 Invite-Based User Creation

Admins can invite users by email:

1. Admin enters target email.
2. System generates a random invite token (> 128 bits) and **stores only its hash**:
   - `inviteTokenHash = sha256(rawToken)`
   - `rawToken` is sent only via email and never logged.
3. System stores invite record with:
   - `email`
   - `inviteTokenHash`
   - `issuedAt`
   - `expiresAt` (e.g., 7–30 days)
   - `invitedBy`
   - `status` (`pending`, `accepted`, `expired`, `revoked`)
4. Email is sent using templates defined via `_AI_TEMPLATES_AND_DEFAULTS.md`, typically under:
   - `app-repo/templates/core/invite-email.json` (factory)
   - `STORAGE_ROOT/templates/core/invite-email.json` (server override)

When user clicks invite link:

- User visits a registration page with the raw token in the URL.
- Backend:
  - Hashes the raw token,
  - Looks up matching invite by `inviteTokenHash` and `status = pending`,
  - Checks `expiresAt`.
- If valid:
  - User is prompted to choose `username` (unique) and `password`.
  - A user record is created or re-used with:
    - `userId` (internal id for this deployment).
    - `email` = invite email.
    - `userExternalId` initially set to the email (for email+password flows).
    - An initial `status` such as `active` or `pending_verification` per
      deployment policy.
  - Any pending project memberships or roles that referenced this email (or
    `userExternalId`) become effective for this user.
  - Invite status → `accepted`.
- If invalid:
  - Show generic failure message (no account enumeration).
  - AI must not reveal whether email is known or not.

> **Conceptual behavior only:** This repo does not implement actual invite
> storage or user records yet. The above flows describe how backends must
> treat email, `userId`, and `userExternalId` once implemented so that
> future export/import and membership mapping have a consistent identity
> foundation.

### 4.3 Token Storage Rules

- Invite tokens and password reset tokens must always be stored as **hashes**.
- Raw tokens must never appear in:
  - logs
  - analytics
  - error messages
- Token TTL must be enforced at lookup time.

### 4.3 CurrentUser ↔ users Table Resolution (MVP)

In the intended architecture, the authenticated identity exposed via
`AuthUserInfo` / `CurrentUser` corresponds to a concrete row in the
central `users` table:

- `AuthUserInfo.id` / `CurrentUser.id` are equal to the `users.id`
  primary key for that identity.
- When present, `AuthUserInfo.email` / `CurrentUser.email` should match
  the `users.email` column for that identity.

In this repo, core identity helpers are responsible for resolving
`CurrentUser` into a `users` row using this mapping. The resolution
logic follows these rules:

1. Prefer lookup by id: attempt to load `users` where
  `users.id = CurrentUser.id`.
2. If no row is found and `CurrentUser.email` is present, optionally
  fall back to lookup by email: `users.email = CurrentUser.email`.
3. If both lookups return no row, the helper returns `null` rather than
  throwing; callers decide whether a missing `users` row is an error for
  their workflow.

Dev/test/mocked environments may produce `CurrentUser` values that do
not yet have corresponding `users` rows. Helpers and callers MUST handle
this gracefully by treating `null` as a recoverable condition, not as a
spec violation. For real deployments, backends implementing this spec
are expected to ensure that authenticated identities have matching
`users` rows keyed by id, with consistent primary email values.

---

## 5. LOGIN, LOGOUT & SESSION MODEL

FOLE uses **server-side sessions** for human users.

In this repo, the client-side auth slice is implemented as an in-memory `AuthSessionManager` that can optionally persist and rehydrate sessions via a pluggable `SessionStore` abstraction. Real server-side session cookies, backend session storage, and logout-everywhere behavior are responsibilities of the backend and are not implemented here; Phase 1 focuses on client-side session tracking and rehydration only.

### 5.1 Session Cookie

- Cookie name (e.g.): `fole_session`
- Attributes:
  - `HttpOnly` = true
  - `Secure` = true (must be HTTPS-only in production)
  - `SameSite` = `Lax` or `Strict` (Lax recommended default)
- Cookie contains only:
  - an opaque `sessionId` (random, unpredictable)
- No identity, roles, or PII are stored in the cookie itself.

### 5.2 Session Storage

Session data must be stored server-side in a session store (e.g., DB table or Redis), including:

- `sessionId`
- `userId`
- `createdAt`
- `lastSeenAt`
- `clientFingerprint` (see 5.4)
- `ipInfo` (e.g., anonymized or truncated IP)
- `rolesSnapshot` (optional cache; see 6.3)
- `isElevated` (for recently re-authenticated sessions)
- `expiresAt`

Session store behavior:

- Must enforce TTL based on idle and absolute timeouts.
- Must support efficient lookup and revocation by `userId`.

### 5.3 Session Lifetimes

Recommended defaults (configurable):

- Idle timeout: 30 minutes of inactivity.
- Absolute timeout: 7 days from creation.

Rules:

- On each request, if the session is valid and not expired:
  - Update `lastSeenAt`.
- If idle timeout exceeded or absolute timeout passed:
  - Session is invalid, user must log in again.

### 5.4 Session Binding & Anomaly Detection

To reduce impact of stolen cookies:

- On session creation, store:
  - `userAgent` (full string or hashed)
  - Optional IP-derived fingerprint (e.g., first 24 bits of IP / coarse location)
- On each request, backend must compare:
  - If User-Agent differs significantly (e.g., desktop vs mobile) OR IP fingerprint changes drastically:
    - Either:
      - Mark session as suspicious and optionally invalidate, OR
      - Trigger re-authentication or MFA if enabled.
- Behavior must be consistent and documented.

AI must not loosen binding rules without explicit human instruction.

### 5.5 Login Flow

1. User submits username + password.
2. Backend finds user by `canonicalUsername` (lowercase).
3. If user doesn’t exist or is inactive:
   - Respond with generic "Invalid username or password".
4. If exists and active:
   - Verify password via Argon2id.
   - On success:
     - Create new session record,
     - Set `fole_session` cookie,
     - Optionally check `mfaStatus` and redirect to MFA validation before granting full access.
   - On failure:
     - Increment login-failure counters (see 7.1),
     - Respond with the same generic message.

### 5.6 Logout Flow

- User-triggered logout:
  - Backend deletes session record (or marks it invalid),
  - Clears cookie on client.
- Admin/automation logout (e.g., disable user):
  - Backend must revoke all active sessions for that user.

### 5.7 Session Rotation

- After login and/or MFA success, server should **rotate** the `sessionId` to prevent session fixation.
- On password change or role change, session(s) must be revoked or refreshed to reflect new permissions.

---

## 6. ROLES & AUTHORIZATION INTERACTION

Authentication and authorization are separate but linked.

### 6.1 Identity vs Role Model

- Authentication answers: "Who is this user?"
- Authorization (per `_AI_ROLES_AND_PERMISSIONS.md`) answers: "What can they do?"

AI must always:

1. Authenticate user (or reject).
2. Retrieve roles and permissions.
3. Apply permission logic as defined in `_AI_ROLES_AND_PERMISSIONS.md`.

### 6.2 Project Membership

- For project-scoped operations, the user must:
  - be a member of the project, OR
  - be a SysAdmin (subject to the roles spec) if your deployment policy allows it.

Membership rules and role weights are fully defined in `_AI_ROLES_AND_PERMISSIONS.md`.

### 6.3 Roles Snapshot vs Live Checks

To minimize confusion:

- Sessions may cache a `rolesSnapshot` for performance,
- BUT **authorization decisions must be correct even if roles change**.

Two acceptable strategies:

1. **Live-authoritative model**
   - For privileged operations, always query the current roles/permissions from DB.
   - Snapshot is only a hint/cache.

2. **Revocation-on-role-change model**
   - On any role/permission change for a user:
     - All sessions for that user must be revoked,
     - User must log in again to get a new session with updated roles.

Either strategy is acceptable, but the implementation must choose **one** and apply it consistently. AI may not choose a strategy on its own; it must follow the implementation’s documented choice.

---

## 7. RATE LIMITING & BRUTE FORCE DEFENSE

### 7.1 Login Rate Limiting

- Rate limit login attempts per:
  - `canonicalUsername`
  - IP / IP block
  - Global system threshold

Suggested baseline (configurable):

- Max 5 failed attempts per 10 minutes per username.
- Progressive delay after each failure (e.g., +100ms up to a cap).
- Optional CAPTCHAs for high-volume failures (future extension).

### 7.2 Other Sensitive Endpoints

- Invite endpoints, password reset requests, and token validation endpoints must also be rate-limited.
- Attempts must be logged in a way that does not leak secrets.

### 7.3 Account Lockout (Optional)

- Deployments may choose to lock accounts after repeated failed attempts.
- If implemented, lockout:
  - Must be reversible by an admin,
  - Should generate alerts,
  - Must not reveal whether the username existed before lockout.

---

## 8. PASSWORD RESET FLOW

### 8.1 Request Reset

1. User submits email or username.
2. Regardless of whether an account exists:
   - Respond with generic message: "If an account exists, a reset email has been sent."
3. If account exists and is active:
   - Generate a random reset token (>128 bits),
   - Store only its hash: `resetTokenHash = sha256(rawToken)`,
   - Store `expiresAt` (e.g., 1 hour from issue),
   - Send email using templates from `_AI_TEMPLATES_AND_DEFAULTS.md`.

### 8.2 Confirm Reset

- User clicks link with raw token.
- Backend:
  - Hashes raw token, finds matching record,
  - Verifies `expiresAt` and user status.
- If valid:
  - Prompt for new password,
  - Rehash and replace old password hash atomically,
  - Invalidate all sessions for that user.
- If invalid or expired:
  - Show generic failure message.

### 8.3 AI Rules

- AI must ensure tokens are hashed in storage.
- AI must never log or display raw reset tokens.
- AI must tie reset flows into storage and template specs correctly.

---

## 9. CSRF & FRONTEND SECURITY

### 9.1 CSRF Protection

- All state-changing endpoints (non-GET) must be protected with CSRF tokens.
- Approaches:
  - Server-generated CSRF token stored in a secure cookie + header on requests (double-submit), or
  - Session-bound hidden form token validated per request.

SameSite cookie helps but is **not sufficient** alone.

### 9.2 XSS & Clickjacking

- Auth-related pages (login, reset, invite) must be protected by:
  - Strict output encoding,
  - CSP (Content Security Policy),
  - `X-Frame-Options` / `frame-ancestors` to prevent clickjacking,
  - Proper input validation.

Implementation details are further defined in `_AI_SECURITY_AND_COMPLIANCE_SPEC.md`.

AI must never suggest disabling CSP or framing protection for convenience.

---

## 10. MFA (FUTURE-READY, OPTIONAL)

FOLE does not require MFA for minimum correctness, but the identity model must support it.

### 10.1 MFA Fields

User record fields:

- `mfaMethod`: `null` | `totp` | `webauthn`
- `mfaStatus`: `inactive` | `active` | `setup_required`
- `mfaSecret`: encrypted blob (for TOTP) or registration data (for WebAuthn)

### 10.2 MFA Flow (Conceptual)

- If `mfaStatus = active`:
  - Login step:
    - Validate username/password.
    - Mark session as `pendingMfa`.
    - Only after MFA verification does the session become fully valid.
- MFA secrets must:
  - Be encrypted at rest,
  - Never be logged,
  - Be handled as sensitive data per `_AI_SECURITY_AND_COMPLIANCE_SPEC.md`.

AI must not implement MFA logic outside these constraints.

---

## 11. GDPR, PRIVACY, AND ACCOUNT DELETION

### 11.1 Minimal Retention

- Auth data (username, hashed password, minimal metadata) should be kept as long as the account is active.
- Logs must avoid storing sensitive PII or secrets.

### 11.2 Right to Erasure / Pseudonymization

When a user requests deletion (if allowed):

- Direct deletion of user row may not always be possible due to referential integrity.
- FOLE may use **pseudonymization** for identity fields:
  - Replace `username` with `deleted-<uuid>`
  - Clear or anonymize `email`
  - Mark user as `isActive = false`
- Historical records (e.g., ownership of sketches, maps) may retain a reference to anonymized user id.

Implementation details must comply with `_AI_SECURITY_AND_COMPLIANCE_SPEC.md` and legal requirements.

### 11.3 Backup Considerations

- Backups may contain pre-deletion data; handling of this is defined in `_AI_BACKUP_AND_RECOVERY_SPEC.md`.
- AI must not promise immediate deletion from all backups unless explicitly implemented and documented.

---

## 12. LOGGING & AUDIT

- Auth logs must never store:
  - plaintext passwords,
  - tokens,
  - MFA secrets.
- Logs may store:
  - `userId`, `canonicalUsername`,
  - timestamp,
  - event type (login success/failure, logout, password change, lockout),
  - anonymized IP/UA where allowed.

All logging must respect `_AI_SECURITY_AND_COMPLIANCE_SPEC.md` and `_AI_MONITORING_AND_ALERTING_SPEC.md`.

---

## 13. AI AGENT RULES (CRITICAL)

AI agents interacting with auth-related logic must:

1. **MUST**:
   - Load this spec before designing or modifying auth-related code or flows.
   - Respect Argon2id hashing rules.
   - Use invite flows according to this spec.
   - Enforce session cookies, not localStorage tokens, for human login.
   - Ensure CSRF protection is present for state-changing endpoints.
   - Respect rate limiting conventions.

2. **MUST NOT**:
   - Propose storing tokens or passwords in localStorage or sessionStorage.
   - Disable CSRF or CSP protections without explicit human approval.
   - Add new login endpoints that bypass this spec.
   - Log or print secrets or passwords.

3. **STOP CONDITIONS**:
   - If asked to weaken password hashing.
   - If asked to store passwords or tokens in plaintext.
   - If requested to implement "remember me forever" with no expiry.
   - If invited to bypass CSRF or rate limiting for convenience.
   - If any required field/behavior described here is missing or unclear.

When STOP condition triggers, AI must:
- Refuse to implement the unsafe behavior.
- Explain why, referencing this spec.
- Ask for a human decision or updated requirements if needed.

---

## 14. RELATION TO OTHER SPECS

This auth spec is tightly integrated with:

- `_AI_MASTER_RULES.md`  
  - Overall governance, STOP rules, destructive changes.
- `_AI_STORAGE_ARCHITECTURE.md`  
  - Where user and session data are stored, atomic write behavior.
- `_AI_ROLES_AND_PERMISSIONS.md`  
  - How authenticated users are authorized.
- `_AI_TEMPLATES_AND_DEFAULTS.md`  
  - Invite and reset email templates.
- `_AI_SECURITY_AND_COMPLIANCE_SPEC.md`  
  - Encryption requirements, CSP, logging constraints, GDPR.
- `_AI_BACKUP_AND_RECOVERY_SPEC.md`  
  - How auth data appears in backups and restores.

In case of conflict:

1. `_AI_MASTER_RULES.md` wins for governance and STOP rules.
2. `_AI_SECURITY_AND_COMPLIANCE_SPEC.md` wins for encryption and privacy constraints.
3. This file governs **auth and identity behavior**.
4. `_AI_ROLES_AND_PERMISSIONS.md` governs authorization logic.

---

End of document  
_AI_AUTH_AND_IDENTITY_SPEC.md  
This document is authoritative.  
All FOLE components and AI agents MUST follow it exactly.
