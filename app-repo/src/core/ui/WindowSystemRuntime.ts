
export interface ViewportBounds {
    width: number;
    height: number;
}

export interface WindowIdentity {
    windowKey: string;
    instanceId: string;
}

export interface CanonicalWindowState {
    windowKey: string;
    instanceId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    minimized: boolean;
    zOrder: number;
    docked?: "left" | "right" | "top" | "bottom" | null;
}

export interface WindowRegistryEntry {
    windowKey: string;
    singleton?: boolean;
    defaultSize?: { width: number; height: number };
    minSize?: { width: number; height: number };
}

export interface WindowSystemPersistence {
    load(tabId: string): Promise<CanonicalWindowState[] | null>;
    save(tabId: string, windows: CanonicalWindowState[]): Promise<void>;
    prune?(opts?: { maxAgeMs?: number }): Promise<void>;
}

export interface WindowSystemRuntime {
    list(): CanonicalWindowState[];
    openWindow(windowKey: string, opts?: { instanceId?: string; position?: { x: number; y: number }; size?: { width: number; height: number } }): { ok: true; state: CanonicalWindowState } | { ok: false; error: string };
    closeWindow(identity: WindowIdentity): { ok: true } | { ok: false; error: string };
    focusWindow(identity: WindowIdentity): { ok: true; state: CanonicalWindowState } | { ok: false; error: string };
    moveWindow(identity: WindowIdentity, pos: { x: number; y: number }): { ok: true; state: CanonicalWindowState } | { ok: false; error: string };
    resizeWindow(identity: WindowIdentity, size: { width: number; height: number }): { ok: true; state: CanonicalWindowState } | { ok: false; error: string };
    setMinimized(identity: WindowIdentity, minimized: boolean): { ok: true; state: CanonicalWindowState } | { ok: false; error: string };
    dockWindow(identity: WindowIdentity, dock: "left" | "right" | "top" | "bottom" | null): { ok: true; state: CanonicalWindowState } | { ok: false; error: string };
    setViewport(bounds: ViewportBounds): void;
    loadFromPersistence(): Promise<void>;
    saveToPersistence(): Promise<void>;
}

export function createWindowSystemRuntime(args: {
    tabId: string;
    viewport: ViewportBounds;
    windowRegistryBlockEnvelope: any;
    persistence: WindowSystemPersistence;
    autoPersist?: boolean;
}): WindowSystemRuntime {

    let viewport = { ...args.viewport };
    const registry = new Map<string, WindowRegistryEntry>();
    let windows: CanonicalWindowState[] = [];
    let idCounter = 1;

    // Parse Registry
    if (args.windowRegistryBlockEnvelope && args.windowRegistryBlockEnvelope.data && args.windowRegistryBlockEnvelope.data.windows) {
        const raw = args.windowRegistryBlockEnvelope.data.windows;
        for (const [key, entry] of Object.entries(raw)) {
            const e = entry as any;
            registry.set(key, {
                windowKey: e.windowKey || key,
                singleton: !!e.singleton,
                defaultSize: e.defaultSize,
                minSize: e.minSize
            });
        }
    }

    function getNextZ(): number {
        if (windows.length === 0) return 1;
        return Math.max(...windows.map(w => w.zOrder)) + 1;
    }

    // Helper to trigger auto-persistence
    function persistIfAuto() {
        if (args.autoPersist) {
            runtime.saveToPersistence().catch(err => {
                console.error("WindowSystemRuntime: Auto-persist failed", err);
            });
        }
    }

    function applyDockConstraints(state: CanonicalWindowState) {
        if (!state.docked) return;
        
        const dw = Math.round(viewport.width / 3);
        const dh = Math.round(viewport.height / 3);

        switch (state.docked) {
            case "left":
                state.x = 0;
                state.y = 0;
                state.width = dw;
                state.height = viewport.height;
                break;
            case "right":
                state.width = dw;
                state.height = viewport.height;
                state.x = viewport.width - dw;
                state.y = 0;
                break;
            case "top":
                state.x = 0;
                state.y = 0;
                state.width = viewport.width;
                state.height = dh;
                break;
            case "bottom":
                state.width = viewport.width;
                state.height = dh;
                state.x = 0;
                state.y = viewport.height - dh;
                break;
        }
    }

    function clampBounds(state: CanonicalWindowState) {
        // If docked, dock rules take precedence over clamping logic
        if (state.docked) {
            applyDockConstraints(state);
            return;
        }

        // First clamp size against minSize
        const defaults = registry.get(state.windowKey);
        if (defaults && defaults.minSize) {
            state.width = Math.max(state.width, defaults.minSize.width);
            state.height = Math.max(state.height, defaults.minSize.height);
        }

        // Clamp size against viewport
        if (state.width > viewport.width) state.width = viewport.width;
        if (state.height > viewport.height) state.height = viewport.height;

        // Clamp position
        // x in [0, viewport.width - width]
        // y in [0, viewport.height - height]
        const maxX = Math.max(0, viewport.width - state.width);
        const maxY = Math.max(0, viewport.height - state.height);

        state.x = Math.max(0, Math.min(state.x, maxX));
        state.y = Math.max(0, Math.min(state.y, maxY));
    }

    // Sort by zOrder ascending
    function sortWindows() {
        windows.sort((a, b) => a.zOrder - b.zOrder);
    }

    function findWindow(id: WindowIdentity): CanonicalWindowState | undefined {
        return windows.find(w => w.windowKey === id.windowKey && w.instanceId === id.instanceId);
    }

    const runtime: WindowSystemRuntime = {
        list: () => [...windows],
        
        setViewport: (bounds) => {
            viewport = { ...bounds };
            // re-clamp all windows
            windows.forEach(w => clampBounds(w));
        },

        openWindow: (windowKey, opts) => {
            const regEntry = registry.get(windowKey);
            if (!regEntry) {
                return { ok: false, error: `Unknown windowKey: ${windowKey}` };
            }

            if (regEntry.singleton) {
                const existing = windows.find(w => w.windowKey === windowKey);
                if (existing) {
                    // Bring to front
                    existing.zOrder = getNextZ();
                    sortWindows();
                    persistIfAuto();
                    return { ok: true, state: { ...existing } };
                }
            }

            const instanceId = opts?.instanceId || (regEntry.singleton ? windowKey : `win-${idCounter++}`);
            
            // Check existence logic for manual ID provided?
            const existing = windows.find(w => w.windowKey === windowKey && w.instanceId === instanceId);
            if (existing) {
                 existing.zOrder = getNextZ();
                 sortWindows();
                 persistIfAuto();
                 return { ok: true, state: { ...existing } };
            }

            const defW = regEntry.defaultSize?.width ?? 400;
            const defH = regEntry.defaultSize?.height ?? 300;

            const newState: CanonicalWindowState = {
                windowKey,
                instanceId,
                x: opts?.position?.x ?? 0,
                y: opts?.position?.y ?? 0,
                width: opts?.size?.width ?? defW,
                height: opts?.size?.height ?? defH,
                minimized: false,
                zOrder: getNextZ(),
                docked: null
            };

            clampBounds(newState);
            windows.push(newState);
            sortWindows();
            persistIfAuto();

            return { ok: true, state: { ...newState } };
        },

        closeWindow: (id) => {
            const idx = windows.findIndex(w => w.windowKey === id.windowKey && w.instanceId === id.instanceId);
            if (idx === -1) return { ok: false, error: "Window not found" };
            windows.splice(idx, 1);
            persistIfAuto();
            return { ok: true };
        },

        focusWindow: (id) => {
            const w = findWindow(id);
            if (!w) return { ok: false, error: "Window not found" };
            w.zOrder = getNextZ();
            sortWindows();
            persistIfAuto();
            return { ok: true, state: { ...w } };
        },

        moveWindow: (id, pos) => {
            const w = findWindow(id);
            if (!w) return { ok: false, error: "Window not found" };
            
            w.x = pos.x;
            w.y = pos.y;
            
            if (w.docked) {
                // automatic undock
                w.docked = null;
            }
            
            clampBounds(w);
            persistIfAuto();
            return { ok: true, state: { ...w } };
        },

        resizeWindow: (id, size) => {
            const w = findWindow(id);
            if (!w) return { ok: false, error: "Window not found" };

            if (w.docked) {
                // If docked, we simply re-enforce the dock constraints 
                // effectively ignoring the resize request.
                applyDockConstraints(w);
            } else {
                w.width = size.width;
                w.height = size.height;
                clampBounds(w);
            }
            
            persistIfAuto();
            return { ok: true, state: { ...w } };
        },

        dockWindow: (id, dock) => {
            const w = findWindow(id);
            if (!w) return { ok: false, error: "Window not found" };

            // dock=null means undock
            if (dock === null) {
                w.docked = null;
                // keep current x/y/size clamped
                clampBounds(w);
            } else {
                w.docked = dock;
                applyDockConstraints(w);
            }

            persistIfAuto();
            return { ok: true, state: { ...w } };
        },

        setMinimized: (id, min) => {
            const w = findWindow(id);
            if (!w) return { ok: false, error: "Window not found" };
            w.minimized = min;
            persistIfAuto();
            return { ok: true, state: { ...w } };
        },

        loadFromPersistence: async () => {
             const loaded = await args.persistence.load(args.tabId);
             if (!loaded) return;
             
             const valid: CanonicalWindowState[] = [];
             for (const w of loaded) {
                 // Check registry
                 if (!registry.has(w.windowKey)) continue;
                 // Validate numeric fields
                 if (typeof w.x !== 'number' || typeof w.y !== 'number' || typeof w.width !== 'number' || typeof w.height !== 'number') continue;
                 
                 // Apply corrections if needed
                 clampBounds(w); // ensure valid bounds
                 valid.push(w);
             }
             
             windows = valid;
             sortWindows();
             // Find max z to sync counter if needed (not strict requirement but good practice)
        },

        saveToPersistence: async () => {
            await args.persistence.save(args.tabId, windows);
        }
    };

    return runtime;
}
