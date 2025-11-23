# _AI_EVENT_SYSTEM_AND_WEBHOOK_SPEC.md
Version: 1.0.0
Last-Updated: 2025-11-23
Status: Authoritative Specification (SSOT)

# AI Event System & Webhook Specification
Defines how FOLE generates, routes, filters, delivers, retries, and secures events and webhooks. Binding for all modules, backend services, and all AI agents.

---

## 1. PURPOSE
The Event System provides:
- A uniform event stream for internal modules.
- Guaranteed ordering per resource.
- Deduplicated, idempotent delivery.
- Secure outbound webhook delivery.
- AI-safe interaction: no guessing, no implicit subscriptions.

---

## 2. EVENT MODEL

### 2.1 Event Structure
Each event MUST contain:
```
eventId (uuid)
eventType
resourceType
resourceId
projectId (nullable)
createdAt (ISO8601)
producedBy (user/AI/system)
payload (JSON object)
version
```

### 2.2 Resource Types
- project
- map
- tile
- file
- sketch
- module
- automation
- template

### 2.3 Event Ordering
- Per-resource FIFO ordering is guaranteed.
- Cross-resource ordering is NOT guaranteed.

### 2.4 Delivery Semantics
- Internal subscribers: at-least-once
- Webhook subscribers: exactly-once-with-retry

---

## 3. EVENT BUS

### 3.1 Internal Bus
- In-memory + persistent WAL-backed queue.
- Survives server restart.
- Processes events in order.
- Supports filtering by:
  - eventType
  - projectId
  - module

### 3.2 External Bus
- Webhooks only.
- No direct message broker exposure.

---

## 4. SUBSCRIPTIONS

### 4.1 Module Subscriptions
Modules may declare:
```
events/
  subscribe.json
  handlers/
```

### 4.2 Subscription JSON Schema
```
{
  "events": [
    {
      "eventType": "map.updated",
      "handler": "handlers/onMapUpdated.js",
      "filter": { "projectScoped": true }
    }
  ]
}
```

### 4.3 AI Rules
AI must:
- Read subscribe.json before proposing handlers.
- STOP if subscription unclear.
- Never subscribe a module to system-level events without sysadmin approval.

---

## 5. EVENT TYPES (CANONICAL)

### 5.1 System
- system.start
- system.shutdown
- module.enabled
- module.disabled

### 5.2 Project
- project.created
- project.updated
- project.deleted

### 5.3 Files
- file.uploaded
- file.deleted

### 5.4 Maps
- map.created
- map.updated
- map.calibrated
- map.tilesRebuilt

### 5.5 Sketch
- sketch.created
- sketch.updated
- sketch.deleted

### 5.6 Automations
- automation.created
- automation.start
- automation.end
- automation.error

---

## 6. WEBHOOK SYSTEM

### 6.1 Webhook Object
```
webhookId
projectId (nullable)
url
secret
enabled
eventFilters
retryPolicy
createdAt
createdBy
```

### 6.2 Delivery Policy
- HMAC-SHA256 signature header: `X-Fole-Signature`
- Timeout: 10 seconds
- Retries: exponential backoff (10s → 30s → 2m → 10m → 30m)
- Max attempts: 12
- Dead-letter queue for failed deliveries

### 6.3 Payload
```
{
  "event": { ...event fields },
  "attempt": 1,
  "timestamp": "...",
  "signature": "..."
}
```

---

## 7. SECURITY RULES

1. Webhook secret must be 32+ bytes random.
2. HTTPS required.
3. AI cannot create webhooks unless user has permission.
4. AI MUST STOP if:
   - URL is not HTTPS
   - Permissions unclear
   - Secret missing
   - Event type unknown or undocumented
5. No cross-project webhook access.

---

## 8. ADMINISTRATION

### 8.1 Viewing Subscriptions
Sysadmin may list all:
- module subscriptions
- project subscriptions
- webhooks

### 8.2 Editing Webhooks
- Only ProjectAdmin or SysAdmin.
- All edits logged.

---

## 9. IDENTITY & AUTHENTICATION
- Webhooks use HMAC only.
- No OAuth, no Basic Auth.
- Servers resolving inbound requests must verify signature.

---

## 10. AI STOP CONDITIONS
AI MUST STOP for:
- Unrecognized eventType
- Ambiguous subscription
- Missing webhook secret
- Non-HTTPS endpoint
- Unknown filter rules
- Circular event triggers (event → automation → event → …)

---

## 11. EVENT LOOP SAFETY
To prevent infinite automation loops:
- Every event contains `producedBy`.
- Automation executions must record `triggeredByEventId`.
- If an automation would re-trigger the same eventType on the same resource → STOP and mark unsafe.

---

## 12. DEAD-LETTER QUEUE
Failed webhook deliveries after retry limit go to:
```
STORAGE_ROOT/events/dlq/<webhookId>/<eventId>.json
```
Must contain:
- event
- last error
- attempt count
- timestamp

---

## 13. AUDIT & LOGGING
All events logged to:
- STORAGE_ROOT/logs/events/
- project-level exports include project-level events

---

## 14. RELATION TO OTHER SPECS
This spec integrates with:
- _AI_STORAGE_ARCHITECTURE.md (DLQ, atomic writes)
- _AI_AUTOMATION_ENGINE_SPEC.md (automation → event triggers)
- _AI_SECURITY_AND_COMPLIANCE_SPEC.md
- _AI_MODULE_SYSTEM_SPEC.md

If conflict:
1. _AI_MASTER_RULES.md wins
2. Storage rules win
3. Security rules win
4. This spec

---

End of document  
_AI_EVENT_SYSTEM_AND_WEBHOOK_SPEC.md  
Authoritative and binding.
