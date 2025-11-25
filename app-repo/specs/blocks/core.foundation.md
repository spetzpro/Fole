# Block: core.foundation

## 1. Purpose / Responsibility

Provide shared, low-level building blocks for the entire application:

- Configuration
- Logging
- Diagnostics hooks
- Error/Result primitives
- Common utilities and type helpers

### Not Responsible For

- Business rules (permissions, auth, projects, etc.)
- UI rendering
- Direct DB or file IO (delegated to `core.storage`)

---

## 2. High-Level Summary

`core.foundation` is the base layer every other block depends on. It standardizes how we:

- Load configuration from env + files
- Log structured events
- Represent success/failure (Result/Either-like patterns)
- Expose shared utilities (e.g., ID generation, time helpers)

This block should be **highly stable** and change infrequently.

---

## 3. Modules in This Block

| Module                 | Responsibility                                      | Status        |
|------------------------|-----------------------------------------------------|---------------|
| ConfigService          | Load/merge configuration sources                    | planned       |
| Logger                 | Structured logging interface + adapters             | planned       |
| DiagnosticsHub         | Central diagnostics event emitter                   | planned       |
| FeatureFlags           | Read feature flags (initially in-memory/config)     | planned       |
| CoreTypes              | Result/Error primitives & shared TS types           | planned       |

---

## 4. Data Model

No persistent data of its own.

- In-memory representation of:
  - `AppConfig`
  - `FeatureFlagSet`
  - `LogEvent`

These are pure TS interfaces/types.

---

## 5. Interactions

**Called By**

- All other blocks (`core.auth`, `core.permissions`, `core.storage`, `core.ui`, features).

**Depends On**

- Node/browser runtime
- No internal app blocks (to avoid cycles).

Public-facing API examples:

```ts
import { getConfig } from '@/core/foundation/ConfigService';
import { logInfo, logError } from '@/core/foundation/Logger';
import { Result } from '@/core/foundation/CoreTypes';
```

---

## 6. Events & Side Effects

- Emits diagnostic events to `DiagnosticsHub`
- Writes logs using configured sinks (console, file, remote, etc. later)

No direct user-visible side effects on its own.

---

## 7. External Dependencies

- Minimal logging library (or just `console` for MVP)
- Node process.env / browser env injection

---

## 8. MVP Scope

- `ConfigService` that merges:
  - Hard-coded defaults
  - Env variables
  - Optional config file
- `Logger` with:
  - `logDebug`, `logInfo`, `logWarn`, `logError`
  - Pluggable sink interface (MVP: console sink)
- `Result` type + helper functions
- Very simple `FeatureFlags`:
  - In-memory map
  - `isEnabled(flagName: string): boolean`
