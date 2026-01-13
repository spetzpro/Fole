import { TemplateSessionModel } from './TemplateRuntime';

export interface ActionDescriptor {
    id: string; // generated unique id e.g. "blockId:interaction"
    sourceBlockId: string;
    actionName: string; // The "signal" name to dispatch
    payload?: any;
    accessPolicy?: any; // To be evaluated by caller if needed, or simply informative
}

export function buildActionIndex(model: TemplateSessionModel): ActionDescriptor[] {
    const actions: ActionDescriptor[] = [];
    
    if (!model.actionBlocks) return actions;

    for (const block of model.actionBlocks) {
        if (!block.data || !block.data.interactions) continue;

        const interactions = block.data.interactions;
        // Deterministic iteration of interaction keys
        const keys = Object.keys(interactions).sort();

        for (const key of keys) {
            const definition = interactions[key];
            
            // Map definition to ActionDescriptor
            // definition = { kind: string, params: struct, permissions: [], ... }
            
            if (!definition || !definition.kind) continue;

            let actionName = definition.kind;
            let payload = definition.params;

            // Special handling for 'command' to map to dispatchAction's actionName expectations
            if (definition.kind === 'command' && definition.params && definition.params.commandId) {
                actionName = definition.params.commandId;
                payload = definition.params.args || definition.params;
            }

            // Construct unique ID
            const actionId = `${block.blockId}:${key}`;

            actions.push({
                id: actionId,
                sourceBlockId: block.blockId,
                actionName: actionName,
                payload: payload,
                accessPolicy: definition.permissions ? { permissions: definition.permissions } : undefined
            });
        }
    }

    return actions;
}
