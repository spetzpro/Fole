# Module: core.foundation.ConfigService

## 1. Purpose

Provide a centralized, typed interface for reading application configuration values
(environment, build-time config, feature/config files) so that the rest of the codebase
never reads from `process.env`, `localStorage`, raw JSON, etc. directly.

ConfigService is the **single source of truth** for config lookups.

## 2. Responsibilities

- Expose a simple, typed API for reading configuration values.
- Provide sensible defaults when values are missing (when appropriate).
- Normalize configuration values (e.g. numbers, booleans) from string sources.
- Allow different config providers (env, files, remote) to be wired behind the same API.

Not responsible for:

- Persisting user-level preferences (that belongs in a separate preferences system).
- Fetching remote config at runtime (can be layered later if needed).
- Validation of entire config objects (can be done in startup/bootstrap code).

## 3. Types (MVP)

~~~ts
/**
 * Minimal application config shape for MVP.
 * This can grow over time as needed.
 */
export interface AppConfig {
  environment: "development" | "staging" | "production";
  apiBaseUrl: string;
  auth: {
    apiBaseUrl: string;
  };
  storage: {
    projectsRoot: string; // base folder for projects (STORAGE_ROOT/projects)
  };
}
~~~

## 4. Public API (MVP)

~~~ts
/**
 * Core ConfigService API.
 * Higher-level code should rarely need to access raw AppConfig;
 * they should prefer specific getters when possible.
 */
export interface ConfigService {
  /**
   * Get the strongly-typed AppConfig snapshot.
   * This is read-only from the caller's perspective.
   */
  getAppConfig(): AppConfig;

  /**
   * Convenience accessors for common primitives.
   * These are primarily for internal use and bridging legacy code.
   */
  getString(key: string, fallback?: string): string;
  getNumber(key: string, fallback?: number): number;
  getBoolean(key: string, fallback?: boolean): boolean;
}

/**
 * Obtain the global ConfigService instance.
 * Implementation is provided by the runtime bootstrapping code.
 */
export function getConfigService(): ConfigService;
~~~

## 5. Behavior (MVP)

- On startup, bootstrap code constructs a single AppConfig object
  from environment variables, config files, or other sources.
- ConfigService holds this AppConfig instance for the lifetime of the app.
- `getAppConfig()` always returns the same (possibly frozen) object.
- `getString` / `getNumber` / `getBoolean`:
  - read from an internal key-value map (e.g. flattened view of AppConfig),
  - return the provided fallback when the key is unknown or invalid,
  - are primarily a bridge for code that cannot easily consume AppConfig directly.

## 6. Dependencies

- May depend on:
  - core.foundation.CoreTypes (for Result/AppError in future extensions).
- Must not depend on:
  - feature.* blocks
  - UI code
