export type OverlayId = string;

export interface OverlayState {
    overlayId: OverlayId;
    isOpen: boolean;
    zOrder: number;
}

export interface OverlayRuntime {
    list(): OverlayState[]; // sorted by zOrder asc
    isOpen(overlayId: OverlayId): boolean;
    open(overlayId: OverlayId): { ok: true } | { ok: false; error: string };
    close(overlayId: OverlayId): { ok: true } | { ok: false; error: string };
    toggle(overlayId: OverlayId): { ok: true; isOpen: boolean } | { ok: false; error: string };
    dismissTop(reason: "escape" | "clickOutside"): { ok: true; dismissed?: OverlayId } | { ok: false; error: string };
}

interface RuntimeState {
    [key: string]: OverlayState;
}

export function createOverlayRuntime(args: {
    overlays: any[];
}): OverlayRuntime {
    
    // Index valid overlays for fail-closed validation
    const validOverlayIds = new Set<string>();
    args.overlays.forEach(env => {
        if (env && env.blockId) {
            validOverlayIds.add(env.blockId);
        }
    });

    // In-memory state
    const states: RuntimeState = {};
    
    // Initialize states
    validOverlayIds.forEach(id => {
        states[id] = { overlayId: id, isOpen: false, zOrder: 0 };
    });

    const getNextZ = () => {
        const currentMax = Math.max(0, ...Object.values(states).map(s => s.zOrder));
        return currentMax + 1;
    };

    return {
        list(): OverlayState[] {
            return Object.values(states).sort((a, b) => a.zOrder - b.zOrder);
        },

        isOpen(overlayId: OverlayId): boolean {
            return states[overlayId]?.isOpen || false;
        },

        open(overlayId: OverlayId): { ok: true } | { ok: false; error: string } {
            if (!validOverlayIds.has(overlayId)) {
                return { ok: false, error: `Unknown overlayId: ${overlayId}` };
            }
            const s = states[overlayId];
            if (!s.isOpen) {
                s.isOpen = true;
                s.zOrder = getNextZ();
            }
            // If already open, do we bring to front? Spec "zOrder: when opening, assign maxZ+1".
            // Implementation: Yes, re-opening usually focuses/brings to front.
            else {
                s.zOrder = getNextZ();
            }
            return { ok: true };
        },

        close(overlayId: OverlayId): { ok: true } | { ok: false; error: string } {
            if (!validOverlayIds.has(overlayId)) {
                return { ok: false, error: `Unknown overlayId: ${overlayId}` };
            }
            const s = states[overlayId];
            s.isOpen = false;
            s.zOrder = 0; // Reset Z on close
            return { ok: true };
        },

        toggle(overlayId: OverlayId): { ok: true; isOpen: boolean } | { ok: false; error: string } {
            if (!validOverlayIds.has(overlayId)) {
                return { ok: false, error: `Unknown overlayId: ${overlayId}` };
            }
            const s = states[overlayId];
            if (s.isOpen) {
                this.close(overlayId);
                return { ok: true, isOpen: false };
            } else {
                this.open(overlayId);
                return { ok: true, isOpen: true };
            }
        },

        dismissTop(reason: "escape" | "clickOutside"): { ok: true; dismissed?: OverlayId } | { ok: false; error: string } {
            // Find highest zOrder that is open
            const openOverlays = Object.values(states).filter(s => s.isOpen);
            if (openOverlays.length === 0) {
                return { ok: true, dismissed: undefined };
            }

            // sort desc
            openOverlays.sort((a, b) => b.zOrder - a.zOrder);
            const top = openOverlays[0];
            
            this.close(top.overlayId);
            return { ok: true, dismissed: top.overlayId };
        }
    };
}
