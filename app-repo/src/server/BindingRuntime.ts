import { ShellBundle } from "./ShellConfigTypes";
import { applyDerivedBindings, BindingEngineResult } from "./BindingEngine";
import { dispatchTriggeredBindings, TriggerEvent, TriggerContext, TriggeredBindingResult } from "./TriggeredBindingEngine";

export class BindingRuntime {
    private bundle: ShellBundle["bundle"];
    private runtimeState: Record<string, any>;
    private lock: boolean = false;

    constructor(bundle: ShellBundle["bundle"], runtimeState: Record<string, any>) {
        this.bundle = bundle;
        this.runtimeState = runtimeState;
    }

    /**
     * Executes one tick of the derived binding engine.
     * Enforces re-entrancy protection (A1 fail-closed).
     */
    public applyDerivedTick(): BindingEngineResult {
        if (this.lock) {
            return {
                applied: 0,
                skipped: 1, // Count as 1 major skip
                logs: ["A1: BindingRuntime re-entrancy detected: applyDerivedTick called while locked."]
            };
        }

        this.lock = true;
        const result: BindingEngineResult = { applied: 0, skipped: 0, logs: [] };

        try {
            result.logs.push("[BindingRuntime] Starting derived tick.");
            const engineResult = applyDerivedBindings(this.bundle, this.runtimeState);
            
            result.applied = engineResult.applied;
            result.skipped = engineResult.skipped;
            result.logs.push(...engineResult.logs);
            result.logs.push(`[BindingRuntime] Derived tick complete. Applied: ${result.applied}, Skipped: ${result.skipped}`);
        } catch (e: any) {
            // Fail-closed on unexpected error, though engines shouldn't throw.
            result.skipped = 1;
            result.logs.push(`A1: [BindingRuntime] Critical Error in applyDerivedTick: ${e.message}`);
            result.logs.push(`[BindingRuntime] Derived tick aborted.`);
        } finally {
            this.lock = false;
        }

        return result;
    }

    /**
     * Dispatches a specific event to the triggered binding engine.
     * Enforces re-entrancy protection (A1 fail-closed).
     */
    public dispatchEvent(evt: TriggerEvent, ctx: TriggerContext): TriggeredBindingResult {
        if (this.lock) {
            return {
                applied: 0,
                skipped: 1, // Count as 1 major skip
                logs: ["A1: BindingRuntime re-entrancy detected: dispatchEvent called while locked."]
            };
        }

        this.lock = true;
        const result: TriggeredBindingResult = { applied: 0, skipped: 0, logs: [] };

        try {
            result.logs.push(`[BindingRuntime] Dispatching event '${evt.name}' from '${evt.sourceBlockId}'.`);
            const engineResult = dispatchTriggeredBindings(this.bundle, this.runtimeState, evt, ctx);

            result.applied = engineResult.applied;
            result.skipped = engineResult.skipped;
            result.logs.push(...engineResult.logs);
            result.logs.push(`[BindingRuntime] Dispatch complete. Applied: ${result.applied}, Skipped: ${result.skipped}`);
        } catch (e: any) {
            // Fail-closed on unexpected error
            result.skipped = 1;
            result.logs.push(`[BindingRuntime] Dispatch aborted.`);
            result.logs.push(`A1: [BindingRuntime] Critical Error in dispatchEvent: ${e.message}`);
        } finally {
            this.lock = false;
        }

        return result;
    }

    public getBindingsDebugInfo(): any[] {
        const bindings: any[] = [];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!this.bundle || !this.bundle.blocks) return bindings;

        for (const [id, block] of Object.entries(this.bundle.blocks)) {
            if (block.blockType === 'binding') {
                const b = block as any;
                bindings.push({
                    bindingId: b.blockId || id,
                    mode: b.data?.mode,
                    trigger: b.data?.mapping?.trigger,
                    enabled: b.data?.enabled
                });
            }
        }
        return bindings;
    }

    public getBlockStateSnapshot(blockId: string): any {
        const block = this.bundle.blocks[blockId];
        if (!block) return null;

        const defaultData = block.data || {};
        const runData = this.runtimeState[blockId] || {};

        // Simple shallow merge for debugging visibility
        // If runtime structure was deep, we'd need deep merge
        return { ...defaultData, ...runData };
    }

    public getInternalStateDebug(): Record<string, any> {
        return this.runtimeState;
    }
}
