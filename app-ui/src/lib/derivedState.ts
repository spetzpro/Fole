export function mergeDerivedProps(
    baseProps: Record<string, unknown>,
    derivedState: Record<string, Record<string, unknown>>,
    nodeId: string,
    nodeProps?: Record<string, unknown>
): Record<string, unknown> {
    const blockId = typeof nodeProps?.blockId === 'string' ? (nodeProps?.blockId as string) : undefined;
    const idProp = typeof nodeProps?.id === 'string' ? (nodeProps?.id as string) : undefined;

    const patch =
        derivedState[nodeId] ??
        (blockId ? derivedState[blockId] : undefined) ??
        (idProp ? derivedState[idProp] : undefined);

    return patch ? { ...baseProps, ...patch } : baseProps;
}
