export type WindowStateLike = {
    x: number;
    y: number;
    width: number;
    height: number;
    zOrder: number;
};

export type PersistedWindowLayout = {
    openWindows: string[];
    focusedWindowId: string | null;
    windows: Record<string, WindowStateLike>;
};

export function serializeWindowLayout(snapshot: {
    windows: Record<string, WindowStateLike>;
    focusedWindowId?: string | null;
}): PersistedWindowLayout {
    const openWindows = Object.keys(snapshot.windows || {});
    const windows: Record<string, WindowStateLike> = {};

    openWindows.forEach(id => {
        const w = snapshot.windows[id];
        if (!w) return;
        windows[id] = {
            x: w.x,
            y: w.y,
            width: w.width,
            height: w.height,
            zOrder: w.zOrder
        };
    });

    return {
        openWindows,
        focusedWindowId: snapshot.focusedWindowId ?? null,
        windows
    };
}

export function deserializeWindowLayout(raw: string | null): PersistedWindowLayout | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as PersistedWindowLayout;
        if (!parsed || !Array.isArray(parsed.openWindows) || typeof parsed.windows !== 'object') return null;
        return {
            openWindows: parsed.openWindows.filter(id => typeof id === 'string'),
            focusedWindowId: typeof parsed.focusedWindowId === 'string' ? parsed.focusedWindowId : null,
            windows: parsed.windows || {}
        };
    } catch {
        return null;
    }
}

export function filterLayoutByAvailableWindows(
    layout: PersistedWindowLayout,
    availableWindowIds: Set<string>
): PersistedWindowLayout {
    const openWindows = layout.openWindows.filter(id => availableWindowIds.has(id));
    const windows: Record<string, WindowStateLike> = {};
    openWindows.forEach(id => {
        const w = layout.windows[id];
        if (w) windows[id] = w;
    });

    const focusedWindowId = layout.focusedWindowId && availableWindowIds.has(layout.focusedWindowId)
        ? layout.focusedWindowId
        : null;

    return {
        openWindows,
        focusedWindowId,
        windows
    };
}
