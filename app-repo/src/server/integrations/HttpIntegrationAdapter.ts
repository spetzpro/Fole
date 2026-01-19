import { IntegrationAdapter, IntegrationRequest, IntegrationResult, IntegrationAdapterCapabilities } from "./IntegrationAdapterTypes";

export class HttpIntegrationAdapter implements IntegrationAdapter {
    capabilities: IntegrationAdapterCapabilities = {
        execute: true,
        dryRun: true,
        requiresSecrets: false,
        productionSafe: false
    };

    async execute(req: IntegrationRequest): Promise<IntegrationResult> {
        const start = Date.now();

        // 1. Basic Type Check
        if (req.integrationType !== 'shell.infra.api.http') {
             return {
                 status: 'error',
                 durationMs: 0,
                 errorMessage: `HttpIntegrationAdapter received invalid type: ${req.integrationType}`
             };
        }

        // 2. Validate URL presence
        if (!req.url) {
            return {
                status: 'error',
                durationMs: 0,
                errorMessage: "Integration request missing 'url'."
            };
        }

        // 3. Dry Run Check
        if (!req.execute) {
            return {
                status: 'dry_run',
                durationMs: 0
            };
        }

        // 4. Execution Mode
        try {
            // Safety Check: Hostname
            const parsedUrl = new URL(req.url);
            const hostname = parsedUrl.hostname;
            const allowedHosts = ['localhost', '127.0.0.1', '::1'];
            
            if (!allowedHosts.includes(hostname)) {
                throw new Error(`Host '${hostname}' not in allowlist.`);
            }
            
            // Safety Check: Method
            const method = (req.method || 'GET').toUpperCase();
            if (method !== 'GET') {
                throw new Error(`Method '${method}' not allowed in debug execute mode (GET only).`);
            }

            // Timeout Limit
            const controller = new AbortController();
            const timeoutMs = req.timeoutMs || 3000; // Default 3s
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            const response = await fetch(req.url, {
                method: 'GET', // Force GET per requirement
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            const text = await response.text();
            const snippet = text.slice(0, 2048); // 2KB limit

            return {
                status: 'success',
                httpStatus: response.status,
                durationMs: Date.now() - start,
                responseSnippet: snippet
            };

        } catch (err: any) {
             return {
                status: 'error',
                durationMs: Date.now() - start,
                errorMessage: err.message
            };
        }
    }
}
