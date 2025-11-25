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

let globalConfigService: ConfigService | undefined;

export function setConfigService(service: ConfigService): void {
  globalConfigService = service;
}

export function getConfigService(): ConfigService {
  if (!globalConfigService) {
    throw new Error("ConfigService has not been initialized");
  }
  return globalConfigService;
}
