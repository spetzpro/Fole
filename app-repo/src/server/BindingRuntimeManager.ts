import { ShellConfigRepository } from "./ShellConfigRepository";
import { BindingRuntime } from "./BindingRuntime";

export interface BindingRuntimeManager {
    getRuntime(): BindingRuntime | undefined;
    getRuntimeState(): Record<string, any>;
    reload(): Promise<void>;
    getSnapshotMetadata(): { activeVersionId: string | null; activatedAt: string | null };
}

export function createBindingRuntimeManager(configRepo: ShellConfigRepository): BindingRuntimeManager {
    const runtimeState: Record<string, any> = {};
    let bindingRuntime: BindingRuntime | undefined;
    
    // Metadata for debug snapshot
    let currentActiveVersionId: string | null = null;
    let currentActivatedAt: string | null = null;

    const getRuntime = () => bindingRuntime;
    const getRuntimeState = () => runtimeState;
    const getSnapshotMetadata = () => ({
        activeVersionId: currentActiveVersionId,
        activatedAt: currentActivatedAt
    });

    const reload = async () => {
        try {
            const active = await configRepo.getActivePointer();
            if (!active || !active.activeVersionId) {
                console.log("[BindingRuntime] No active version found; disabling runtime.");
                bindingRuntime = undefined;
                currentActiveVersionId = null;
                currentActivatedAt = null;
                return;
            }

            const activeVersionId = active.activeVersionId;
            // Note: We deliberately let getBundle throw if I/O fails, falling to catch -> keep old runtime
            const entry = await configRepo.getBundle(activeVersionId);

            if (entry && entry.bundle) {
                // Initialize runtime state for blocks from bundle defaults
                for (const [id, block] of Object.entries(entry.bundle.blocks)) {
                    if (block.blockType !== "binding" && runtimeState[id] === undefined) {
                        runtimeState[id] = {};
                    }
                }

                // Atomic re-instantiation: new instance, tick, then swap
                const newRuntime = new BindingRuntime(entry.bundle, runtimeState);
                const primeResult = newRuntime.applyDerivedTick();

                bindingRuntime = newRuntime;
                currentActiveVersionId = activeVersionId;
                currentActivatedAt = new Date().toISOString();

                console.log(`[BindingRuntime] Reloaded active=${activeVersionId} applied=${primeResult.applied} skipped=${primeResult.skipped}`);
                if (primeResult.logs.length > 0) {
                    primeResult.logs.forEach(l => console.log(`  [BindingLog] ${l}`));
                }
            } else {
                // Explicitly empty/missing bundle content -> Disable
                console.log(`[BindingRuntime] Active version ${activeVersionId} found but bundle empty; disabling runtime.`);
                bindingRuntime = undefined;
                currentActiveVersionId = null;
                currentActivatedAt = null;
            }
        } catch (err: any) {
            // Unexpected error (I/O, parsing, etc) -> Keep last-known-good runtime
            console.error(`A1: [BindingRuntime] Reload failed: ${err.message}. Runtime remains on previous bundle.`);
        }
    };
    
    return {
        getRuntime,
        getRuntimeState,
        reload,
        getSnapshotMetadata
    };
}
