Version: SPEC_V1.0
Status: Draft
Last-Updated: 2026-02-01

# AI Guidance: Activation & Signaling

This document defines activation signaling semantics for configuration changes. It is a lightweight spec focused on activation events and session-scoped banners, without prescribing a full notification system.

---

## 1. Definitions

**ConfigVersion**
- A versioned configuration snapshot that can be activated to become the active runtime configuration.

**ActivationEvent**
- A record of an attempt to activate a ConfigVersion, including metadata and outcome.

**Banner**
- A session-scoped UI surface that conveys the most recent activation outcome. It is ephemeral and replaces older banners.

---

## 2. ActivationEvent Fields

An ActivationEvent contains:
- **id**: string
  - Stable event identifier (unique per event).
- **fromVersionId**: string | null
  - Version before activation (if known).
- **toVersionId**: string
  - Version being activated.
- **actorId?**: string
  - Actor identifier (user id) when available.
- **actorLabel?**: string
  - Human-readable label for dev/system actions (e.g., "dev").
- **reason**: string (required for manual activation)
  - Human-entered reason for activation.
- **timestamp**: string (ISO-8601)
  - When the activation was attempted or completed.
  - Implementation detail: storage may persist this as **ts**; **ts** must map to **timestamp** at read time.
- **outcome**: "success" | "failure"
  - Whether activation completed successfully.
- **errorMessage?**: string
  - Optional short error description for failed activation.
- **requestId?**: string
  - Request correlation id for tracing.

---

## 3. Banner Derivation Rules

- The banner reflects the **most recent** ActivationEvent in the current session.
- Newer events **replace** older banners.
- Banners are **ephemeral**:
  - They may auto-hide after a short TTL (e.g., 8–10 seconds).
  - They can be manually dismissed.
- Banners are not a durable audit log.

**Applying Veil (Optional)**
- During activation or post-save refresh, the UI may show a transient veil overlay (e.g., “Applying configuration…”).
- The veil is session-scoped, non-persistent, and must clear even on error.
- The veil is a UX affordance only; it is not an audit signal or persistent record.

---

## 4. Visibility Rules

- **Global Banner (Session)**
  - Shown to the active user during the current session.
  - Intended for immediate feedback after activation.

- **Admin Activation Log (MVP)**
  - A minimal, durable ActivationEvent log is persisted server-side.
  - Read-only access is provided via admin-gated endpoints.
  - This log is intended for recent history and troubleshooting, not full compliance auditing.
  - Endpoint (MVP): `GET /api/v1/admin/activations?limit=50`
  - Storage (dev default): `STORAGE_ROOT/shell/activation-events.jsonl`

- **Audit Log (Future)**
  - A full audit system remains out of scope for this spec.
  - Future audit infrastructure may consume ActivationEvents or derive its own entries.

- **Notifications (Future)**
  - A user notification system is explicitly out of scope.
  - No push or inbox behavior is defined here.

---

## 5. Example Flows

### 5.1 Dev / Localhost
- A user activates a new version with a reason.
- An ActivationEvent is created with actorLabel = "dev".
- Banner shows: "Saved & activated: <versionId>".
- Banner auto-dismisses after TTL.

### 5.2 Production
- A sysadmin activates a version with a required reason.
- ActivationEvent records fromVersionId and toVersionId, actorId, reason.
- If activation fails, outcome="failure" and errorMessage is populated.
- Banner shows failure message with errorMessage and can be dismissed.

---

## 6. Non-Goals

- Defining a full audit trail or compliance-grade event storage.
- Building a global notification system or inbox.
- Specifying backend persistence or database schema for activation events.
- Designing a full UI framework for banners beyond minimal session feedback.
