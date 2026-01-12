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
            // result.logs.push("[BindingRuntime] Starting derived tick."); // Keeping logs concise as requested, but "at least one log entry per call start/end"
            const engineResult = applyDerivedBindings(this.bundle, this.runtimeState);
            
            result.applied = engineResult.applied;
            result.skipped = engineResult.skipped;
            result.logs.push(...engineResult.logs);
            result.logs.push(`[BindingRuntime] Derived tick complete. Applied: ${result.applied}, Skipped: ${result.skipped}`);
        } catch (e: any) {
            // Fail-closed on unexpected error, though engines shouldn't throw.
            result.logs.push(`[BindingRuntime] Critical Error in applyDerivedTick: ${e.message}`);
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
            // result.logs.push(`[BindingRuntime] Dispatching event '${evt.name}' from '${evt.sourceBlockId}'.`);
            const engineResult = dispatchTriggeredBindings(this.bundle, this.runtimeState, evt, ctx);

            result.applied = engineResult.applied;
            result.skipped = engineResult.skipped;
            result.logs.push(...engineResult.logs);
            result.logs.push(`[BindingRuntime] Dispatch complete. Applied: ${result.applied}, Skipped: ${result.skipped}`);
        } catch (e: any) {
            // Fail-closed on unexpected error
            result.logs.push(`[BindingRuntime] Critical Error in dispatchEvent: ${e.message}`);
        } finally {
            this.lock = false;
        }

        return result;
    }
}
