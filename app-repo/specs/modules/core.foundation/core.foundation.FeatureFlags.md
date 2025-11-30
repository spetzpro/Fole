# Module: core.foundation.FeatureFlags

## Module ID
core.foundation.FeatureFlags

## 1. Purpose

The `core.foundation.FeatureFlags` module provides a **centralized feature flag system** for the application.

It is responsible for:

- Holding default boolean flag values.
- Allowing in-memory overrides for dev/test scenarios.
- Providing a simple `isEnabled(name)` API.
- Providing a snapshot of current flag values for debugging or UI.

It is not responsible for:

- Persisting flags.
- Configuration file or remote flag loading (these can be layered on later).
- Per-user or per-tenant segmentation.

## 2. Responsibilities and Non-Responsibilities

### Responsibilities

- Define:

  ```ts
  export type FeatureFlagName = string;

  export interface FeatureFlagsConfig {
    defaults: Record<FeatureFlagName, boolean>;
  }
  ```

- Provide functions:

  ```ts
  export function initFeatureFlags(config: FeatureFlagsConfig): void;
  export function getFeatureFlags(): {
    isEnabled(name: FeatureFlagName): boolean;
    getSnapshot(): { values: Record<string, boolean> };
  };
  export function setFeatureFlagOverrides(overrides: Record<string, boolean>): void;
  export function clearFeatureFlagOverrides(): void;
  ```

- Guarantee:

  - Unknown flags default to `false`.
  - Overrides take precedence over defaults.
  - Calls are non-throwing.

### Non-Responsibilities

- Does **not** manage rollout strategies or experimentation frameworks.
- Does **not** persist flags across restarts.
- Does **not** decide the UI behavior; it only says "enabled" or "disabled".

## 3. Public API

> Conceptual API; implementation lives in `src/core/foundation/FeatureFlags.ts`.

```ts
export type FeatureFlagName = string;

export interface FeatureFlagsConfig {
  defaults: Record<FeatureFlagName, boolean>;
}

export function initFeatureFlags(config: FeatureFlagsConfig): void;
export function getFeatureFlags(): {
  isEnabled(name: FeatureFlagName): boolean;
  getSnapshot(): { values: Record<string, boolean> };
};
export function setFeatureFlagOverrides(overrides: Record<string, boolean>): void;
export function clearFeatureFlagOverrides(): void;
```

## 4. Behavior

- `initFeatureFlags`:
  - Sets the default flag values.
  - Clears any existing overrides.

- `setFeatureFlagOverrides`:
  - Replaces the override set completely with the provided map.

- `clearFeatureFlagOverrides`:
  - Clears overrides; subsequent checks use defaults only.

- `getFeatureFlags`:
  - `isEnabled(name)`:
    - If `overrides[name]` is defined → return overrides[name].
    - Else if `defaults[name]` is defined → return defaults[name].
    - Else → `false`.
  - `getSnapshot()`:
    - Returns `{ values: mergedDefaultsAndOverrides }`.

## 5. Planned vs Implemented

### Current status

- **Lifecycle status**: Stable
  - Implementation exists at `src/core/foundation/FeatureFlags.ts`.
  - Tests at `tests/core/featureFlags.test.ts` validate:
    - Default flag behavior.
    - Unknown flags default to false.
    - Override behavior and snapshot output.
    - Clearing overrides restores default behavior.

### Planned enhancements

- Possible wiring to ConfigService for default values from config.
- Optional tooling for listing all known flags from type-level sources.

## 6. Dependencies

### Upstream dependencies

- None beyond basic JS/TS.

It MUST NOT depend on:

- Higher-level modules (auth, permissions, storage, UI, features).

### Downstream dependents

- All blocks that want to gate behavior on flags.

## 7. Testing Strategy

Tests SHOULD:

- Initialize with a simple defaults object.
- Verify that overriding a flag changes `isEnabled` and `getSnapshot`.
- Verify that clearing overrides restores defaults.

Existing tests already cover these scenarios.

## 8. CI / Governance Integration

Any change to:

- The shape of `FeatureFlagsConfig`.
- The semantics of `isEnabled` or overrides.

MUST:

1. Update this spec.
2. Update `FeatureFlags.ts`.
3. Update `featureFlags.test.ts`.
4. Keep block spec and inventory notes accurate.
5. Ensure `npm run spec:check` passes.
