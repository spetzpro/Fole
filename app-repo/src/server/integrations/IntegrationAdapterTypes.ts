export interface IntegrationRequest {
    integrationId: string;
    integrationType: string;
    config: Record<string, any>; // The integration block configuration (baseUrl, etc.)
    method?: string; // GET, POST, etc.
    path?: string;   // /users, /status, etc.
    url?: string;    // Fully resolved URL (if applicable)
    timeoutMs?: number;
    execute: boolean; // If false, perform validity checks/dry-run only
}

export interface IntegrationResult {
    status: "dry_run" | "success" | "error";
    httpStatus?: number;
    durationMs?: number;
    responseSnippet?: string;
    errorMessage?: string;
    payload?: any; // Parsed response if needed later
}

export interface IntegrationAdapterCapabilities {
    execute: boolean;
    dryRun: boolean;
    requiresSecrets: boolean;
    productionSafe: boolean;
}

export interface IntegrationAdapter {
    capabilities: IntegrationAdapterCapabilities;

    /**
     * Executes the integration logic.
     * Must enforce its own safety checks (allowlist, timeouts, etc).
     */
    execute(req: IntegrationRequest): Promise<IntegrationResult>;
}
