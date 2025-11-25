export type FeatureFlagName = string;

export interface FeatureFlagsConfig {
  defaults: Record<FeatureFlagName, boolean>;
}

interface FeatureFlagsState {
  defaults: Record<string, boolean>;
  overrides: Record<string, boolean>;
}

let state: FeatureFlagsState = {
  defaults: {},
  overrides: {},
};

export function initFeatureFlags(config: FeatureFlagsConfig): void {
  state = {
    defaults: { ...config.defaults },
    overrides: {},
  };
}

export function setFeatureFlagOverrides(overrides: Record<string, boolean>): void {
  state.overrides = { ...overrides };
}

export function clearFeatureFlagOverrides(): void {
  state.overrides = {};
}

export function getFeatureFlags(): {
  isEnabled(name: FeatureFlagName): boolean;
  getSnapshot(): { values: Record<string, boolean> };
} {
  return {
    isEnabled(name: FeatureFlagName): boolean {
      if (Object.prototype.hasOwnProperty.call(state.overrides, name)) {
        return state.overrides[name];
      }
      if (Object.prototype.hasOwnProperty.call(state.defaults, name)) {
        return state.defaults[name];
      }
      return false;
    },
    getSnapshot(): { values: Record<string, boolean> } {
      const values: Record<string, boolean> = { ...state.defaults };
      for (const [key, value] of Object.entries(state.overrides)) {
        values[key] = value;
      }
      return { values };
    },
  };
}
