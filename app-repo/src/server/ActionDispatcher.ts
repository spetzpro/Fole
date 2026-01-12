import { TriggerEvent, TriggerContext, TriggeredBindingResult } from "./TriggeredBindingEngine";

export interface BindingRuntimeDispatch {
    dispatchEvent(evt: TriggerEvent, ctx: TriggerContext): TriggeredBindingResult;
}

export function dispatchActionEvent(
    bindingRuntime: BindingRuntimeDispatch | undefined,
    sourceBlockId: string,
    actionName: string,
    payload: any,
    ctx: TriggerContext
): TriggeredBindingResult {
    if (!bindingRuntime) {
        return { 
            applied: 0, 
            skipped: 1, 
            logs: [`A1: [Action] Dropped '${actionName}' from '${sourceBlockId}': BindingRuntime not active.`] 
        };
    }

    const event: TriggerEvent = {
        sourceBlockId,
        sourcePath: "/", 
        name: actionName,
        payload
    };

    return bindingRuntime.dispatchEvent(event, ctx);
}
