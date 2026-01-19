import { IntegrationAdapter } from "./IntegrationAdapterTypes";
import { HttpIntegrationAdapter } from "./HttpIntegrationAdapter";

export class IntegrationAdapterRegistry {
    private static instance: IntegrationAdapterRegistry;
    private adapters: Map<string, IntegrationAdapter>;

    private constructor() {
        this.adapters = new Map();
        this.registerBuiltIns();
    }

    public static getInstance(): IntegrationAdapterRegistry {
        if (!IntegrationAdapterRegistry.instance) {
            IntegrationAdapterRegistry.instance = new IntegrationAdapterRegistry();
        }
        return IntegrationAdapterRegistry.instance;
    }

    private registerBuiltIns(): void {
        this.register('shell.infra.api.http', new HttpIntegrationAdapter());
    }

    public register(type: string, adapter: IntegrationAdapter): void {
        this.adapters.set(type, adapter);
    }

    public getAdapter(type: string): IntegrationAdapter | undefined {
        return this.adapters.get(type);
    }
}
