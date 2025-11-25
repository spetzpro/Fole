# Module: core.foundation.FeatureFlags

## 1. Purpose
Provide centralized feature flag handling with config defaults and in-memory overrides.

## 2. Responsibilities
- Load boolean flags from config
- Provide isEnabled(name)
- Support in-memory overrides for dev/test
- Expose snapshot of flags

## 3. Public API (MVP)
~~~ts
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
~~~

## 4. Behavior
- Unknown flags default to false
- Overrides take precedence
- Safe to call; never throws

## 5. Example
~~~ts
const flags = getFeatureFlags();
if (flags.isEnabled("new-sketch-engine")) {
  // new behavior
}
~~~
