Version: 1.0.0
Last-Updated: 2025-11-23
Status: Authoritative Specification (SSOT)

# _AI_NETWORK_AND_API_SPEC.md
Defines FOLE’s networking, API boundaries, protocol rules, and AI-safe integration layer.

## 1. PURPOSE
This spec defines:
- HTTP/WS API contract
- Request/response normalization
- Authentication rules
- API versioning
- CORS and CSRF rules
- Rate limiting
- AI STOP conditions
- External API integration constraints

This is binding for all AI agents, backend systems, reverse proxies, and modules.

## 2. ARCHITECTURE OVERVIEW
FOLE exposes:
- REST API (primary)
- WebSocket streams (events)
- gRPC (optional future)
- Internal service-to-service APIs (DAL, Storage, Modules)

All public APIs must:
1. Be versioned under `/api/v<major>/`
2. Use JSON exclusively
3. Include server-generated requestId
4. Be deterministic and schema-validated

## 3. AUTHENTICATION
Supported:
- JWT (short-lived)
- Refresh tokens
- Service tokens (for backend-only modules)
- No API keys for user accounts

Rules:
- AI cannot generate or modify JWT secrets
- Tokens must include: sub, roles, expiry, tenant
- Expired token → 401, never auto-refresh without explicit user request

## 4. AUTHORIZATION
Authorization is performed AFTER authentication and follows:
- _AI_ROLES_AND_PERMISSIONS.md
- Project scoping rules
- No role escalation via API

Headers:
- `X-Project-Id` required when calling project-scoped APIs

## 5. REQUEST NORMALIZATION
Incoming requests must be normalized:
- Trim whitespace in keys
- Lowercase header names
- Reject unknown top-level keys unless schema allows
- Enforce strict type checking

AI must not send ambiguous payloads.

## 6. RESPONSE NORMALIZATION
All responses include:
```
{
  "ok": true/false,
  "data": {...},
  "error": {...},
  "requestId": "...",
  "timestamp": "ISO8601"
}
```

Errors use:
```
error.code
error.message
error.details
```

## 7. API VERSIONING
Rules:
- Backwards-compatible changes allowed within same major version
- Breaking changes → bump major version
- Deprecated fields must remain 1 major version before removal
- `/api/v1/` is stable baseline

AI must never call deprecated endpoints unless fallback requested by human.

## 8. RATE LIMITING
Layered throttling:
- Per-user
- Per-project
- Global
- Burst limits

AI rules:
- If rate limit triggered → STOP, do not retry automatically
- Respect Retry-After header

## 9. CORS & CSRF
CORS restricted:
- Allowed origins configurable
- No wildcard in production
- Preflight required for non-simple methods

CSRF:
- Stateless APIs require double-submit cookie pattern for browser clients
- AI cannot bypass CSRF checks

## 10. WEBSOCKETS
Used for:
- events
- job updates
- map rendering state

Rules:
- Must authenticate via header token
- No wildcard channels
- Project must match Project-Id header
- Messages must follow stable schema

## 11. EXTERNAL API CALLING RULES
FOLE may call:
- OAuth identity provider
- Email/SMS gateways
- Map tile providers (optional)

AI restrictions:
- AI cannot propose new external APIs without human approval
- AI must STOP if endpoint domain unknown or undocumented

## 12. ERROR HANDLING
Errors follow _AI_ERROR_HANDLING_AND_DIAGNOSTICS_SPEC.md.

AI must:
- Never retry 4xx errors
- Retry 5xx only when Retry-After exists
- STOP on unknown codes

## 13. SECURITY RULES
Networking must follow _AI_SECURITY_AND_COMPLIANCE_SPEC.md:
- TLS 1.3 required
- No plaintext HTTP allowed internally except local IPC
- HSTS enabled for all public endpoints
- No data leakage via error messages

## 14. DISCOVERY RULES
API discoverability:
- `/api/v1/meta/schema` → endpoint schemas
- `/api/v1/meta/routes` → documented route table
- AI must use schema before constructing payloads

STOP if schema missing or ambiguous.

## 15. LOGGING
Each API call logs:
- method, path
- latency
- userId or serviceId
- projectId
- statusCode
- requestId

Sensitive fields must be redacted.

## 16. AI RULES (CRITICAL)
AI MUST:
- Load this spec before calling any API
- Validate payloads locally before sending
- Ask for missing parameters
- STOP on:
  - ambiguous path
  - undocumented endpoint
  - missing schema
  - unknown response format
  - permission mismatch
  - rate limit hit without Retry-After

AI MUST NOT:
- Guess endpoints
- Call internal service APIs directly
- Create tokens
- Invoke deprecated routes

## 17. RELATION TO OTHER SPECS
- Storage rules: _AI_STORAGE_ARCHITECTURE.md
- Auth/roles: _AI_ROLES_AND_PERMISSIONS.md
- Error patterns: _AI_ERROR_HANDLING_AND_DIAGNOSTICS_SPEC.md
- Events: _AI_EVENT_SYSTEM_AND_WEBHOOK_SPEC.md

Hierarchy on conflict:
1. _AI_MASTER_RULES.md
2. Security spec
3. Storage spec
4. This spec

# END OF DOCUMENT
