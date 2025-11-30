# Block: core.foundation

## Block ID
core.foundation

## 1. Purpose

The `core.foundation` block is the **base layer** of the application. It provides shared primitives and infrastructure that other blocks can safely depend on, without importing business rules or feature logic.

It is responsible for:

- **Logging**: a leveled, scoped logger API that never throws.
- **Feature flags**: an in-memory feature flag system with defaults and overrides.
- **Diagnostics**: a non-fatal diagnostic event hub for internal debugging and observability.
- **Configuration**: a typed configuration snapshot (`AppConfig`) and service for reading config values.
- **Core types**: generic `Result` and `AppError` types (and related helpers) used across the codebase.

It is not responsible for:

- Business workflows or domain-specific logic.
- UI rendering or layout.
- Direct persistence or networking.
- Role/permission definitions (covered by other specs such as `_AI_ROLES_AND_PERMISSIONS.md`).

`core.foundation` should change infrequently and remain highly stable once established.

## 2. Scope and Non-Scope

### In scope

- Cross-cutting, low-level concerns that many modules need:
  - Logging instrumentation.
  - Diagnostics and tracing events.
  - Feature flags with defaults and overrides.
  - Configuration bootstrap and access.
  - Result/error primitives that avoid throwing for expected failures.
- Functions and types that are safe to import from **any block**.

### Out of scope

- Any business-specific or domain-specific behavior.
- Direct dependencies on feature modules.
- Heavy-weight integrations (e.g., external monitoring vendors) — these may be plugged into diagnostics but are not hardcoded.

## 3. Block Decomposition

`core.foundation` is decomposed into the following modules:

| Module ID                               | Responsibility                                     | Status        |
|-----------------------------------------|----------------------------------------------------|---------------|
| `core.foundation.Logger`                | Scoped, leveled logging API                        | Implemented   |
| `core.foundation.FeatureFlags`          | Centralized feature flag defaults + overrides      | Stable        |
| `core.foundation.DiagnosticsHub`        | Diagnostic event hub + emit helpers                | Stable        |
| `core.foundation.ConfigService`         | App configuration snapshot and access              | Implemented   |
| `core.foundation.CoreTypes`             | Result/AppError/Maybe core types                   | Implemented   |

### Block lifecycle status: **Implemented**

- All listed modules have specs, implementations, and some level of tests.
- FeatureFlags and DiagnosticsHub behave as **Stable** components for their responsibility.
- Logger, ConfigService, and CoreTypes are **Implemented** and widely used but still lack some direct test coverage and/or advanced integration; they will move toward Stable as usage and tests solidify.

Any new `core.foundation.*` module must be added to this table and tracked in the inventories.

## 4. Responsibilities per Module (High-Level)

### 4.1 `core.foundation.Logger` (Implemented)

Provides:

- A leveled logging API (`debug`, `info`, `warn`, `error`).
- Scoped loggers via `getLogger("scope")` that prefix messages (e.g., `[core.storage.ProjectRegistry]`).
- Global log level filtering (e.g., debug vs warn).
- Non-throwing logging via `safeLog` (all console calls wrapped in try/catch).

Logger is implemented and has smoke tests verifying non-throwing behavior and level filtering; further integration with DiagnosticsHub or structured logging is considered future work.

### 4.2 `core.foundation.FeatureFlags` (Stable)

Provides:

- `initFeatureFlags(defaults)` to configure default flag values.
- `getFeatureFlags()` returning an object with:
  - `isEnabled(name)` — resolves override first, then defaults, else `false`.
  - `getSnapshot()` — merged view of defaults and overrides.
- `setFeatureFlagOverrides(overrides)` and `clearFeatureFlagOverrides()`.

Tests verify:

- Unknown flags default to `false`.
- Overrides work and can be cleared.
- Snapshot behavior matches expectations.

Feature flags are considered **Stable** for their current scope (in-memory flags); integration with config sources is deferred.

### 4.3 `core.foundation.DiagnosticsHub` (Stable)

Provides:

- `DiagnosticEvent` type (category, type, timestamp, level, correlationId, data).
- `DiagnosticsHub` interface with `emit` and `subscribe`.
- `initDiagnosticsHub(hub)` to install a concrete hub.
- `getDiagnosticsHub()` to access the current hub (defaults to a no-op).
- `emitDiagnostic(event)` as a safe wrapper that never throws.

Tests verify:

- Default hub is a no-op and does not throw.
- Custom hubs receive events via `emitDiagnostic`.
- Subscriber failures do not bubble up and crash the app.

DiagnosticsHub is considered **Stable** as a core diagnostic primitive.

### 4.4 `core.foundation.ConfigService` (Implemented)

Provides:

- A typed `AppConfig` snapshot with at least:
  - `environment` (e.g., development, production).
  - `apiBaseUrl`.
  - `auth.apiBaseUrl`.
  - `storage.projectsRoot`.
- A `ConfigService` interface:
  - `getAppConfig()` — full configuration snapshot.
  - `getString(key)`, `getNumber(key)`, `getBoolean(key)` — primitive lookup from a flattened key/value map.
- Global `setConfigService`/`getConfigService` functions to install and access a ConfigService.

`ConfigBootstrap` provides:

- `createConfigService(options)` that:
  - Builds `AppConfig` from explicit bootstrap options.
  - Flattens options into string-keyed config map for primitive getters.

ConfigService and ConfigBootstrap are implemented and used, but lack dedicated unit tests; they are treated as **Implemented**, moving toward Stable as tests and environment/file integration are added.

### 4.5 `core.foundation.CoreTypes` (Implemented)

Defines:

- `Result<T, E = AppError>`:
  - Discriminated union with `ok: true, value` and `ok: false, error`.
- `AppError`:
  - `code: string`
  - `message: string`
  - `details?: unknown`
  - `cause?: unknown`
- `Maybe<T>`:
  - `T | null | undefined`.

These types are used across:

- core.auth (Result<AuthSession>, AppError for login failures).
- core.permissions (Result<void, AppError> in PermissionGuards).
- core.storage (Result wrappers for IO and DB operations).
- core.ui (ErrorSurface + error boundaries).

CoreTypes is **Implemented** and heavily used; tests currently exercise it indirectly. It may be promoted to Stable after adding small focused tests and an error-code catalog.

## 5. Invariants and Guarantees

- **Logger**
  - Logging must never throw.
  - Log level filtering is global and deterministic.
- **FeatureFlags**
  - Unknown flags always return `false`.
  - Overrides always take precedence over defaults.
- **DiagnosticsHub**
  - `emitDiagnostic` is fail-safe: no exceptions propagate to callers.
  - Default hub is safe to call and does nothing.
- **ConfigService**
  - `getAppConfig` always returns a consistent snapshot built at bootstrap.
  - Primitive getters never throw unexpectedly; they either return sensible defaults or follow documented error behavior.
- **CoreTypes**
  - `Result` and `AppError` semantics must remain consistent across blocks.
  - AppError `code` values are stable identifiers for error types.

## 6. Dependencies

### Allowed dependencies

`core.foundation` may depend on:

- Runtime primitives (e.g., `console`, `process.env`).
- Node/JS standard library types.

It MUST NOT depend on:

- `core.auth`, `core.permissions`, `core.storage`, `core.ui`, or feature modules.
- DB/storage or network libraries that would introduce heavy dependencies (these should be injected or encapsulated elsewhere).

### Downstream dependents

- All other core blocks (auth, permissions, storage, UI).
- Feature blocks (map, sketch, files, comments).
- Any library code needing logging, diagnostics, config, or Result/AppError primitives.

## 7. Performance Considerations

All core.foundation operations are lightweight:

- Logger and DiagnosticsHub perform simple synchronous operations (console logging, in-memory event handling).
- FeatureFlags and ConfigService use in-memory maps with trivial lookups.
- CoreTypes are purely type-level and have no runtime cost beyond object allocations for errors/results.

No explicit performance budget is required at this layer, but care should be taken not to introduce heavy synchronous work inside logging or diagnostics handlers.

## 8. Testing Strategy

Current tests:

- `logger.test.ts` — ensures log methods do not throw and respect log level filtering.
- `featureFlags.test.ts` — ensures defaults/overrides and unknown-flag behavior.
- `diagnosticsHub.test.ts` — ensures emitDiagnostic and hub subscription behave as expected.

Planned tests:

- ConfigService/ConfigBootstrap:
  - Build AppConfig from bootstrap options.
  - Verify flattened keys and primitive getters.
- CoreTypes:
  - Simple unit tests that:
    - Construct Result values.
    - Check AppError shape and codes in a small sample flow.

As new functionality is added (e.g., env/file config loading), tests must verify those flows.

## 9. CI and Governance Integration

`core.foundation` is central to the architecture. Any change to:

- The Logger/DiagnosticsHub/FeatureFlags APIs.
- The shape of `AppConfig`.
- The definition of `Result` or `AppError`.

MUST:

1. Update this block spec.
2. Update corresponding module specs under `specs/modules/core.foundation/**`.
3. Update implementation and tests.
4. Update `Blocks_Modules_Inventory.md` and `specs/inventory/inventory.json` to keep statuses and notes accurate.
5. Ensure `npm run spec:check` passes from the monorepo root.

Other blocks’ specs (_AI_* docs, core.auth, core.permissions, core.storage, core.ui) must be kept consistent with any changes to CoreTypes or foundational services.
