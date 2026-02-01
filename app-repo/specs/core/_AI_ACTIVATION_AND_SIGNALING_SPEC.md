Version: SPEC_V1.0
Status: Draft
Last-Updated: 2026-01-31

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
- **fromVersionId**: string | null
  - Version before activation (if known).
- **toVersionId**: string
  - Version being activated.
- **actorId | actorLabel**: string
  - Identity of actor (user id) or a human-readable label for dev/system actions.
- **reason**: string (required for manual activation)
  - Human-entered reason for activation.
- **timestamp**: string (ISO-8601)
  - When the activation was attempted or completed.
- **outcome**: "success" | "fail"
  - Whether activation completed successfully.
- **errorSummary?**: string
  - Optional short error description for failed activation.

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

- **Audit Log (Future)**
  - A persistent log is out of scope for this spec.
  - A future audit system may consume ActivationEvents or derive its own entries.

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
- If activation fails, outcome="fail" and errorSummary is populated.
- Banner shows failure message with errorSummary and can be dismissed.

---

## 6. Non-Goals

- Defining a durable audit trail or event storage.
- Building a global notification system or inbox.
- Specifying backend persistence or database schema for activation events.
- Designing a full UI framework for banners beyond minimal session feedback.
