# Block: core.auth

## 1. Purpose / Responsibility

Handle user identity and authentication:

- Login / logout
- Session management and refresh
- Expose current user + auth state

### Not Responsible For

- Fine-grained permissions (delegated to `core.permissions`)
- UI layout (delegated to `core.ui`)
- User profile editing (future feature block)

---

## 2. High-Level Summary

`core.auth` defines how the app knows **who** the user is.

It coordinates:

- An auth backend (e.g., API endpoints / token service)
- Local storage of tokens/session
- Reactivity for UI and other blocks when auth state changes

---

## 3. Modules in This Block

| Module              | Responsibility                                      | Status  |
|---------------------|-----------------------------------------------------|---------|
| AuthApiClient       | Low-level calls to backend auth endpoints           | planned |
| AuthSessionManager  | Manage tokens, refresh, and session lifecycle       | planned |
| CurrentUserProvider | Expose current user and auth state                  | planned |
| AuthStateStore      | Observable store for login/logout state             | planned |

---

## 4. Data Model

- `AuthTokens` (access, refresh, expiry)
- `AuthSession` (tokens + metadata)
- `CurrentUser` (id, displayName, email, roles/claims minimal)

Tokens are stored via `core.storage` abstractions (or browser storage) depending on environment.

---

## 5. Interactions

**Called By**

- `core.ui` for login forms and guards
- `core.permissions` for user roles/claims
- Any feature module that needs to know current user

**Depends On**

- `core.foundation` (logging, Result, config)
- `core.storage` for secure token storage (where applicable)

Example API:

```ts
import { login, logout } from '@/core/auth/AuthSessionManager';
import { useCurrentUser } from '@/core/auth/AuthStateStore';
```

---

## 6. Events & Side Effects

- Emits auth state change events:
  - `logged_in`
  - `logged_out`
  - `session_refreshed`
- Side effects:
  - Persist tokens
  - Clear tokens on logout

---

## 7. External Dependencies

- HTTP client abstraction (fetch/axios-style)
- Backend auth API (details defined in separate API contract spec)

---

## 8. MVP Scope

- Basic username/password login
- Logout
- Store tokens (MVP: memory + simple persistent store)
- Expose `CurrentUser` with:
  - `id`
  - `displayName`
  - `roles` (string[])

No social login or complex flows in MVP.
