import type { AppConfig, ConfigService } from "./ConfigService";

export interface ConfigBootstrapOptions {
  storageRoot: string;
  environment?: AppConfig["environment"];
  apiBaseUrl?: string;
  authApiBaseUrl?: string;
}

export function createConfigService(options: ConfigBootstrapOptions): ConfigService {
  const appConfig: AppConfig = {
    environment: options.environment ?? "development",
    apiBaseUrl: options.apiBaseUrl ?? "",
    auth: {
      apiBaseUrl: options.authApiBaseUrl ?? "",
    },
    storage: {
      projectsRoot: options.storageRoot,
    },
  };

  const flat: Record<string, string> = {
    "environment": appConfig.environment,
    "api.baseUrl": appConfig.apiBaseUrl,
    "auth.apiBaseUrl": appConfig.auth.apiBaseUrl,
    "storage.projectsRoot": appConfig.storage.projectsRoot,
  };

  return {
    getAppConfig(): AppConfig {
      return appConfig;
    },
    getString(key: string, fallback?: string): string {
      const value = flat[key];
      if (typeof value === "string") {
        return value;
      }
      return fallback ?? "";
    },
    getNumber(key: string, fallback?: number): number {
      const value = flat[key];
      if (value === undefined) {
        return fallback ?? 0;
      }
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback ?? 0;
    },
    getBoolean(key: string, fallback?: boolean): boolean {
      const value = flat[key];
      if (value === undefined) {
        return fallback ?? false;
      }
      const normalized = value.toLowerCase();
      if (normalized === "true" || normalized === "1") {
        return true;
      }
      if (normalized === "false" || normalized === "0") {
        return false;
      }
      return fallback ?? false;
    },
  };
}
