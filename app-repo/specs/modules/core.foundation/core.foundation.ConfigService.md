# Module: core.foundation.ConfigService

## Module ID
core.foundation.ConfigService

## 1. Purpose

The `core.foundation.ConfigService` module provides a **centralized, typed configuration interface** for the app.

It is responsible for:

- Exposing a strongly-typed `AppConfig` snapshot.
- Providing basic primitive getters (`getString`, `getNumber`, `getBoolean`) over a flattened config map.
- Acting as the **single source of truth** for configuration lookups, so other modules avoid reading from `process.env`, raw JSON, etc.

It is not responsible for:

- Fetching remote configuration at runtime.
- Persisting user-level preferences.
- Validating entire config graphs (this can be done at bootstrap time).
- Governance of Shell Configuration (handled by `core.ux.shell`).

## 2. Responsibilities and Non-Responsibilities

### Responsibilities

- Define:

  ```ts
  export interface AppConfig {
    environment: "development" | "staging" | "production";
    apiBaseUrl: string;
    auth: {
      apiBaseUrl: string;
    };
    storage: {
      projectsRoot: string;
    };
  }
  ```

- Define `ConfigService` interface:

  ```ts
  export interface ConfigService {
    getAppConfig(): AppConfig;
    getString(key: string, fallback?: string): string;
    getNumber(key: string, fallback?: number): number;
    getBoolean(key: string, fallback?: boolean): boolean;
  }
  ```

- Provide:

  ```ts
  export function getConfigService(): ConfigService;
  export function setConfigService(service: ConfigService): void;
  ```

- Provide bootstrap helpers (in `ConfigBootstrap.ts`):

  - `createConfigService(options)` that:
    - Builds an `AppConfig` from explicit bootstrap options.
    - Flattens config into a simple key-value map for primitive getters.

### Non-Responsibilities

- Does **not** decide how env variables or config files are merged; that is handled by bootstrap code.
- Does **not** expose mutable config after startup; configuration is intended to be effectively read-only.

## 3. Public API (MVP)

> Specs and implementation live in `src/core/foundation/ConfigService.ts` and `ConfigBootstrap.ts`.

```ts
export interface AppConfig {
  environment: "development" | "staging" | "production";
  apiBaseUrl: string;
  auth: {
    apiBaseUrl: string;
  };
  storage: {
    projectsRoot: string;
  };
}

export interface ConfigService {
  getAppConfig(): AppConfig;
  getString(key: string, fallback?: string): string;
  getNumber(key: string, fallback?: number): number;
  getBoolean(key: string, fallback?: boolean): boolean;
}

export function getConfigService(): ConfigService;
export function setConfigService(service: ConfigService): void;
```

Behavior (MVP):

- A single `ConfigService` instance is installed at bootstrap via `setConfigService`.
- `getAppConfig` returns the same snapshot throughout the lifetime of the app.
- Primitive getters:
  - Read from a flattened map built from `AppConfig`.
  - Use the provided fallback if the key is missing or not parseable.
  - If no fallback is provided, behavior (throw vs default) is defined by implementation and should be documented.

## 4. Planned vs Implemented

### Current status

- **Lifecycle status**: Implemented
  - `ConfigService` and `ConfigBootstrap` implementations exist and are used by CoreRuntime and other modules.
  - There are no dedicated tests yet for ConfigService; behavior is indirectly exercised by runtime wiring.

### Planned enhancements

- Add tests that:
  - Construct `AppConfig` via `createConfigService` and validate:
    - `getAppConfig` contents.
    - Flattened key lookups for strings, numbers, booleans.
  - Clarify behavior when a key is missing and no fallback is supplied.
- Add optional env/file integration:
  - Bootstrapping from `process.env` and config files as described in higher-level specs.

## 5. Dependencies

### Upstream dependencies

- Basic JS/TS only.

### Downstream dependents

- CoreRuntime and other modules that need typed config:
  - DB/connectivity
  - auth endpoints
  - storage roots
  - feature flags (in future)

## 6. Testing Strategy

Tests SHOULD:

- Use an explicit bootstrap options object to create a ConfigService.
- Verify that:
  - `getAppConfig` returns the expected structure.
  - `getString/getNumber/getBoolean` behave as expected for present/missing keys.
- Cover basic error conditions or defaulting behavior.

Until these tests exist, ConfigService remains Implemented but not Stable.

## 7. CI / Governance Integration

Any change to:

- The shape of `AppConfig`.
- The semantics of primitive getters.

MUST:

1. Update this spec.
2. Update implementations in `ConfigService.ts` and `ConfigBootstrap.ts`.
3. Add/update tests.
4. Keep `core.foundation` block spec and inventory notes in sync.
5. Ensure `npm run spec:check` passes.
