import { useState, useEffect, useRef, useMemo, Fragment, createContext, useContext } from 'react';
import './App.css';
import { apiUrl } from './lib/apiBase';
import { deserializeWindowLayout, filterLayoutByAvailableWindows, serializeWindowLayout } from './lib/windowLayout';
import type { PersistedWindowLayout } from './lib/windowLayout';
import V2RendererPreview from './V2RendererPreview';
import { findSysadminBlock, parseSysadminConfig } from './SysadminLoader';

const UI_BUILD_ID = `dev_${Date.now().toString()}`;

// --- Capabilities Context ---
interface RuntimeCapabilities {
  debugEndpointsEnabled: boolean;
  devModeOverridesEnabled: boolean;
}
const CapabilitiesContext = createContext<RuntimeCapabilities>({ debugEndpointsEnabled: false, devModeOverridesEnabled: false });
export const useCapabilities = () => useContext(CapabilitiesContext);

interface PingResponse {
  allowed: boolean;
  status: number;
  targetBlockId?: string;
}

interface BundleResponse {
  manifest: unknown;
  blocks: Record<string, unknown>;
}

// Helper type for local usage
interface BundleBlock {
    blockId: string;
    blockType: string;
    schemaVersion?: string;
    data?: unknown;
    id?: string;
}

type DerivedPatches = Record<string, Record<string, unknown>>;

// --- Minimal In-Browser Runtime Models ---

interface OverlayState {
  id: string;
  isOpen: boolean;
  zOrder: number;
  blockType?: string;
  title?: string;
}

interface WindowState {
  id: string;
  title: string;
    x: number;
    y: number;
    width: number;
    height: number;
    isMinimized: boolean;
    dockMode: 'none' | 'left' | 'right' | 'top' | 'bottom';
    zOrder: number;
}

interface ActionDefinition {
    id: string;
    actionName: string;
    sourceBlockId: string;
}

type ActionDispatchResult = {
    applied: number;
    skipped: number;
    logs: string[];
    error?: string;
};

type WindowEvent = {
    ts: string;
    kind: 'window.opened' | 'window.focused' | 'window.closed';
    windowId: string;
};


type RuntimePlan = {
    entrySlug: string;
    targetBlockId?: string;
    windows: Record<string, WindowState>;
    focusedWindowId?: string | null;
    availableWindows?: Record<string, { title: string }>;
    overlays: Record<string, OverlayState>;
    actions: ActionDefinition[];
};

class WindowSystemRuntime {
    private entrySlug = '';
    private targetBlockId?: string;
    private windows = new Map<string, WindowState>();
    private overlays = new Map<string, OverlayState>();
    private actions: ActionDefinition[] = [];
    private rawBlocks = new Map<string, Record<string, unknown>>();
    private windowDefs = new Map<string, { title: string }>();
    private zCounter = 1;
    private viewWidth = 900;
    private viewHeight = 600;
    private focusedWindowId: string | null = null;

    public init(bundleData: BundleResponse, ping: PingResponse, viewWidth = 900, viewHeight = 600) {
        this.entrySlug = (bundleData?.manifest as any)?.entrySlug ?? '';
        this.targetBlockId = ping?.targetBlockId;
        this.viewWidth = viewWidth;
        this.viewHeight = viewHeight;

        const blocksObj = bundleData?.blocks ?? {};
        const blocksArray = Array.isArray(blocksObj)
            ? (blocksObj as unknown[])
            : Object.values(blocksObj as Record<string, unknown>);

        this.windows.clear();
        this.overlays.clear();
        this.actions = [];
        this.windowDefs.clear();
        this.rawBlocks.clear();
        this.zCounter = 1;
        this.focusedWindowId = null;

    // Reset Lazy Registration State
    this.rawBlocks.clear();

    // A. Pre-scan for Registry and Typed Blocks
    let registryWindows: Set<string> | null = null;
    const windowBlocks = new Map<string, { title: string, blockType: string }>();

    blocksArray.forEach((block: unknown) => {
        if (!block || typeof block !== 'object') return;
        const b = block as Record<string, unknown>;
        const bId = (typeof b.id === 'string' ? b.id : '') || (typeof b.blockId === 'string' ? b.blockId : '');
        
        if (bId) this.rawBlocks.set(bId, b);

        const bType = typeof b.blockType === 'string' ? b.blockType : '';
        const bTitle = (typeof b.title === 'string' ? b.title : '') || (typeof b.name === 'string' ? b.name : '') || bId;

        if (!bId) return;

        // Capture Registry
        if (bType === 'shell.infra.window_registry' && b.data && typeof b.data === 'object') {
            const data = b.data as Record<string, any>;
            if (data.windows && typeof data.windows === 'object') {
                registryWindows = new Set(Object.keys(data.windows));
            }
        }

        // Capture Potential Windows (Strict Type preferred)
        // EXCLUDE registry block itself from potential windows
        if (bType !== 'shell.infra.window_registry' && bType === 'ui.node.window') {
             windowBlocks.set(bId, { title: bTitle, blockType: bType });
        }
    });

    // B. Register Windows (Registry preferred, fallback to all 'ui.node.window')
    const windowsToRegister = new Set<string>();
    
    // If Registry exists, register its windows IF they are valid ui.node.window blocks
    if (registryWindows) {
        (registryWindows as Set<string>).forEach((wid: string) => {
            // Strict Filter: Only register if we confirmed it is a ui.node.window
            if (windowBlocks.has(wid)) {
                windowsToRegister.add(wid);
            }
        });
        
        // Also ensure any explicit ui.node.window is registered even if not in registry
        // This supports standard window behavior without strict registry requirement
        windowBlocks.forEach((_, wid) => windowsToRegister.add(wid));
    } else {
        // Fallback: Register all found candidates (strictly ui.node.window now)
        windowBlocks.forEach((_, wid) => windowsToRegister.add(wid));
    }

    // 1. Scan for Windows & Overlays
    blocksArray.forEach((block: unknown) => {
        if (!block || typeof block !== 'object') return;
        const b = block as Record<string, unknown>;
        
        const blockType = typeof b.blockType === 'string' ? b.blockType : '';
        // Fallback to blockId if id is missing
        const blockId = (typeof b.id === 'string' ? b.id : '') || (typeof b.blockId === 'string' ? b.blockId : '');
        const title = (typeof b.title === 'string' ? b.title : '') || 
                      (typeof b.name === 'string' ? b.name : '') || 
                      blockId;

      if (!blockId) return;

      if (blockType.includes('overlay')) {
        this.overlays.set(blockId, {
          id: blockId,
          isOpen: false,
          zOrder: 2000, // Overlays sit above windows
          blockType,
          title
        });
      } else if (windowsToRegister.has(blockId)) {
         // Store Definition
         this.windowDefs.set(blockId, { title });

      }
      
      // 2. Scan for Actions (Legacy & Standard Button actions)
      // RE-ADDED MINIMAL SCANNER for action.dispatch to ensure they exist in registry
      if (blockType === 'action.dispatch' && b.data && typeof b.data === 'object') {
          const d = b.data as Record<string,any>;
          if (d.id) {
             this.actions.push({
                 id: d.id, 
                 sourceBlockId: blockId, 
                 actionName: 'dispatch' 
             });
          }
      }
      
      // Supported Action Type: action.openWindow
      if (blockType === 'action.openWindow' && b.data && typeof b.data === 'object') {
          const d = b.data as Record<string,any>;
          // Use ID from block or data.id
          const actId = (typeof d.id === 'string' ? d.id : '') || blockId;
          this.actions.push({
              id: actId,
              sourceBlockId: blockId,
              actionName: 'openWindow'
          });
      }

      let actionsList: unknown[] = [];
       if (Array.isArray(b.actions)) {
           actionsList = b.actions;
       } else if (b.data && typeof b.data === 'object' && Array.isArray((b.data as Record<string, unknown>).actions)) {
           actionsList = (b.data as Record<string, unknown>).actions as unknown[];
       }

       if (actionsList.length > 0) {
          actionsList.forEach((act: unknown) => {
             if (typeof act === 'string') {
                 this.actions.push({ id: `${blockId}:${act}`, actionName: act, sourceBlockId: blockId });
             }
          });
       } else if (blockType.includes('button')) {
          this.actions.push({ id: `${blockId}:click`, actionName: 'click', sourceBlockId: blockId });
       }
    });
  }

  // --- Window Operations ---
  
  // Lazy Registration Helper
  private ensureDefinition(windowId: string) {
      if (this.windowDefs.has(windowId)) return true;
      
      const b = this.rawBlocks.get(windowId) as Record<string, any>;
      if (!b) {
          return false;
      }
      
      const bType = typeof b.blockType === 'string' ? b.blockType : '';
      // Minimal validation: must be a window-like type or explicitly in registry (implicit if we are here via rawBlocks and it was not picked up by strict scan?)
      // Actually, just apply the lenient check here:
      if (bType === 'ui.node.window' || bType.includes('window') || bType.includes('panel')) {
           const title = (typeof b.title === 'string' ? b.title : '') || 
                      (typeof b.name === 'string' ? b.name : '') || windowId;
           this.windowDefs.set(windowId, { title });
           return true;
      }
      return false;
  }

  public openWindow(windowId: string) {
      // 1. If already open, focus it
      if (this.windows.has(windowId)) {
          this.focusWindow(windowId);
          // Always ensure unminimized
          this.setMinimized(windowId, false);
          return;
      }
      
      // 2. If not open, look up def and create
      let def = this.windowDefs.get(windowId);
      
      // Lazy Ensure
      if (!def) {
          this.ensureDefinition(windowId);
          def = this.windowDefs.get(windowId);
      }

      if (def) {
         const minVisibleW = 120;
         const minVisibleH = 80;
         const startX = 100;
         const startY = 100;
         const x = Math.max(0, Math.min(startX, this.viewWidth - minVisibleW));
         const y = Math.max(0, Math.min(startY, this.viewHeight - minVisibleH));
         this.windows.set(windowId, {
             id: windowId,
             title: def.title,
             x,
             y,
             width: 400,
             height: 300,
             isMinimized: false,
             dockMode: 'none',
             zOrder: ++this.zCounter
         });
         this.focusedWindowId = windowId;
      } else {
          console.warn(`Window definition not found for: ${windowId}`);
      }
  }

  public focusWindow(id: string) {
    const w = this.windows.get(id);
    if (!w) return;
        if (this.focusedWindowId !== id) {
                this.focusedWindowId = id;
                w.zOrder = ++this.zCounter;
                this.windows.set(id, { ...w });
        }
  }

  public moveWindow(id: string, x: number, y: number) {
    const w = this.windows.get(id);
    if (!w) return;
    // Clamping logic (0,0 to 900,600 approx)
    const maxX = 900 - 50; // Allow partial offscreen
    const maxY = 600 - 30; // Capture title bar
    this.windows.set(id, {
        ...w,
        x: Math.max(0, Math.min(x, maxX)),
        y: Math.max(0, Math.min(y, maxY)),
        dockMode: 'none' // moving undocks
    });
  }

  public resizeWindow(id: string, width: number, height: number) {
    const w = this.windows.get(id);
    if (!w) return;
    this.windows.set(id, { 
        ...w, 
        width: Math.max(100, width), 
        height: Math.max(80, height),
        dockMode: 'none'
    });
  }

  public closeWindow(id: string) {
      // For this demo, we just remove it to simulate closing
      this.windows.delete(id);
      if (this.focusedWindowId === id) {
          const remaining = Array.from(this.windows.values());
          if (remaining.length > 0) {
              const next = remaining.reduce((top, w) => (w.zOrder > top.zOrder ? w : top), remaining[0]);
              this.focusedWindowId = next.id;
          } else {
              this.focusedWindowId = null;
          }
      }
  }

  public closeAllWindows() {
      this.windows.clear();
      this.focusedWindowId = null;
  }

  public restoreLayout(layout: PersistedWindowLayout) {
      this.windows.clear();
      let maxZ = this.zCounter;

      const openIds = Array.isArray(layout.openWindows) ? layout.openWindows : [];
      for (const windowId of openIds) {
          if (!this.windowDefs.has(windowId)) continue;
          const def = this.windowDefs.get(windowId);
          const saved = layout.windows?.[windowId];
          const width = typeof saved?.width === 'number' ? saved.width : 400;
          const height = typeof saved?.height === 'number' ? saved.height : 300;
          const x = typeof saved?.x === 'number' ? saved.x : 100;
          const y = typeof saved?.y === 'number' ? saved.y : 100;
          const zOrder = typeof saved?.zOrder === 'number' ? saved.zOrder : ++maxZ;

          this.windows.set(windowId, {
              id: windowId,
              title: def?.title || windowId,
              x,
              y,
              width,
              height,
              isMinimized: false,
              dockMode: 'none',
              zOrder
          });

          if (zOrder > maxZ) maxZ = zOrder;
      }

      this.zCounter = Math.max(this.zCounter, maxZ);

      if (layout.focusedWindowId && this.windows.has(layout.focusedWindowId)) {
          this.focusedWindowId = layout.focusedWindowId;
      } else if (this.windows.size > 0) {
          const remaining = Array.from(this.windows.values());
          const next = remaining.reduce((top, w) => (w.zOrder > top.zOrder ? w : top), remaining[0]);
          this.focusedWindowId = next.id;
      } else {
          this.focusedWindowId = null;
      }
  }

  public setMinimized(id: string, min: boolean) {
    const w = this.windows.get(id);
    if (!w) return;
    this.windows.set(id, { ...w, isMinimized: min });
  }

  public dockWindow(id: string, mode: WindowState['dockMode']) {
     const w = this.windows.get(id);
     if (!w) return;
     
     const newState = { ...w, dockMode: mode, isMinimized: false };
     
     // Simple Dock Logic (Viewport 900x600)
     if (mode === 'left') {
         newState.x = 0; newState.y = 0; newState.height = 600; newState.width = 450;
     } else if (mode === 'right') {
         newState.x = 450; newState.y = 0; newState.height = 600; newState.width = 450;
     } else if (mode === 'top') {
         newState.x = 0; newState.y = 0; newState.width = 900; newState.height = 300;
     } else if (mode === 'bottom') {
         newState.x = 0; newState.y = 300; newState.width = 900; newState.height = 300;
     } else if (mode === 'none') {
         // reset to center-ish
         newState.width = 400; newState.height = 300;
         newState.x = 100; newState.y = 100;
     }
     
     this.windows.set(id, newState);
  }

  // --- Overlay Operations ---
  public setOverlayOpen(id: string, isOpen: boolean) {
      const o = this.overlays.get(id);
      if (!o) return;
      this.overlays.set(id, { ...o, isOpen });
  }

  public dismissTop() {
      // Find highest z-order open overlay
      let top: OverlayState | null = null;
      for (const o of this.overlays.values()) {
          if (o.isOpen) {
              if (!top || o.zOrder > top.zOrder) top = o;
          }
      }
      if (top) {
          this.setOverlayOpen((top as OverlayState).id, false);
      }
  }

  public getSnapshot(): RuntimePlan {
    return {
       entrySlug: this.entrySlug,
       targetBlockId: this.targetBlockId,
       windows: Object.fromEntries(this.windows),
             focusedWindowId: this.focusedWindowId,
             availableWindows: Object.fromEntries(this.windowDefs),
       overlays: Object.fromEntries(this.overlays),
       actions: this.actions
    };
  }
}

// --- Components ---

function WindowFrame({ 
    win, 
    isFocused,
    onFocus, 
    onMove, 
    onResize, 
    onClose, 
    onMinimize, 
    onDock,
    children
}: { 
    win: WindowState,
    isFocused: boolean,
    onFocus: () => void,
    onMove: (x: number, y: number) => void,
    onResize: (w: number, h: number) => void,
    onClose: () => void,
    onMinimize: (val: boolean) => void,
    onDock: (mode: WindowState['dockMode']) => void,
    children?: React.ReactNode
}) {
    // Drag
    const startDrag = (e: React.MouseEvent) => {
        onFocus();
        if (win.dockMode !== 'none') return; // Cannot drag docked windows
        e.preventDefault();
        const startX = e.clientX;
        const startY = e.clientY;
        const startLeft = win.x;
        const startTop = win.y;

        const onMouseMove = (me: MouseEvent) => {
            const dx = me.clientX - startX;
            const dy = me.clientY - startY;
            onMove(startLeft + dx, startTop + dy);
        };
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };
    // Resize
    const startResize = (e: React.MouseEvent) => {
        onFocus();
        if (win.dockMode !== 'none') return; // Cannot resize docked windows
        e.preventDefault();
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = win.width;
        const startHeight = win.height;

        const onMouseMove = (me: MouseEvent) => {
            const dx = me.clientX - startX;
            const dy = me.clientY - startY;
            onResize(startWidth + dx, startHeight + dy);
        };
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };
    const isDocked = win.dockMode !== 'none';
    return (
        <div 
            onMouseDown={onFocus}
            style={{
                position: 'absolute',
                left: win.x,
                top: win.y,
                width: win.isMinimized ? 200 : win.width,
                height: win.isMinimized ? 40 : win.height,
                zIndex: win.zOrder,
                backgroundColor: 'white',
                border: '1px solid #999',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 0,
                    boxShadow: isFocused
                        ? 'inset 0 0 0 2px rgba(0,0,0,0.35)'
                        : 'inset 0 0 0 1px rgba(0,0,0,0.12)',
                    pointerEvents: 'none',
                    zIndex: 9999
                }}
            />
            {/* Title Bar */}
            <div 
                onMouseDown={startDrag}
                style={{
                    height: '30px',
                    backgroundColor: isFocused ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.03)',
                    color: '#333',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 8px',
                    cursor: isDocked ? 'default' : 'move',
                    userSelect: 'none',
                    justifyContent: 'space-between'
                }}
            >
                <div style={{fontWeight: 'bold', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'120px'}}>{win.title}</div>
                <div style={{display:'flex', gap:'4px'}} onMouseDown={(e) => e.stopPropagation()}>
                    {!win.isMinimized && (
                         <>
                           <button onClick={() => onDock('left')}>&lt;</button>
                           <button onClick={() => onDock('right')}>&gt;</button>
                           <button onClick={() => onDock('none')}>O</button>
                         </>
                    )}
                    <button onClick={() => onMinimize(!win.isMinimized)}>{win.isMinimized ? '□' : '_'}</button>
                    <button onClick={onClose} style={{background: '#c00', color:'white'}}>X</button>
                </div>
            </div>

            {/* Content Area */}
            {!win.isMinimized && (
                <div style={{flex: 1, overflow:'hidden', position:'relative', display:'flex', flexDirection:'column'}}>
                    <div style={{flex:1, overflow:'auto', position:'relative'}}>
                        {children}
                    </div>
                    
                    {/* Resize Handle */}
                    {!isDocked && (
                        <div 
                           onMouseDown={startResize}
                           style={{
                               position: 'absolute',
                               right: 0,
                               bottom: 0,
                               width: '15px',
                               height: '15px',
                               cursor: 'nwse-resize',
                               background: 'linear-gradient(135deg, transparent 50%, #999 50%)' 
                           }}
                        />
                    )}
                </div>
            )}
        </div>
    );
}

function LogViewer({ result }: { result: ActionDispatchResult }) {
    const hasLogs = result.logs && result.logs.length > 0;
    const hasError = !!result.error;

    if (!hasLogs && !hasError) {
        return <div style={{fontStyle:'italic', color:'#999', fontSize:'0.85em', marginTop:'5px'}}>No details.</div>;
    }

    return (
        <pre style={{
            whiteSpace: 'pre-wrap', 
            wordBreak: 'break-word', 
            maxHeight: '200px', 
            overflow: 'auto', 
            background: '#f7f7f7',
            color: '#111',
            padding: '8px', 
            border: '1px solid #ddd',
            margin: '5px 0 0 0',
            fontSize: '0.85em',
            fontFamily: 'monospace'
        }}>
            {result.error && `Error: ${result.error}\n`}
            {hasLogs && result.logs.join('\n')}
        </pre>
    );
}

// --- Status Helper ---
const getActionStatus = (res: ActionDispatchResult) => {
    if (res.error) return 'ERROR';
    if (res.applied > 0) return 'APPLIED';
    if (res.skipped > 0) return 'SKIPPED';
    return 'NO-OP';
};

const getStatusColor = (status: string) => {
    switch(status) {
        case 'ERROR': return '#c62828';
        case 'APPLIED': return '#2e7d32';
        case 'SKIPPED': return '#ef6c00';
        case 'NO-OP': return '#616161';
        default: return '#333';
    }
};


// OverlayLayer removed (unused dead code)


// --- Shared Helpers ---
const deepClone = (obj: unknown) => {
    if (typeof structuredClone === 'function') {
        return structuredClone(obj);
    }
    return JSON.parse(JSON.stringify(obj));
};

interface SnapshotResponse {
    ts?: string;
    activeVersionId?: string | null;
    openWindows?: string[];
    derivedPatchesCount?: number;
    lastDerivedTickTs?: string | null;
    blocks?: {
        byType?: Record<string, number>;
    };
    integrations?: {
        total?: number;
        byType?: Record<string, number>;
    };
}

interface RuntimeInvocation {
    ts: string;
    actionId: string;
    sourceBlockId?: string;
    status: string;
    details?: any;
}

type ActionRunRecord = {
    id: string;
    timestamp: number;
    actionId: string;
    result: ActionDispatchResult;
    sourceBlockId?: string;
};

type DispatchTrace = {
    ts: string;
    actionId?: string;
    status?: string;
    durationMs?: number;
    reasonCode?: string;
    resultSummary?: string;
};
type ActivationEvent = {
    id: string;
    ts: string;
    actor: string;
    reason: string;
    action: string;
    targetVersion: string | null;
    outcome: 'success' | 'failure';
    errorMessage?: string;
    requestId?: string;
    fromVersionId?: string | null;
};
type SysRefresh = {
    bundle: () => Promise<void> | void;
    resolvedGraph: () => void;
    derived: () => Promise<void> | void;
    snapshot: () => Promise<any> | void;
};
type ConfigSysadminViewProps = {
    bundleData: BundleResponse | null; 
    renderKnownPanel?: (blockType: string) => React.ReactNode | null;
    activeVersionId?: string|null;
    onCloneSysadminDraft?: (sysadminBlocks: Record<string, unknown>, reason: string) => Promise<string>;
    onActivateVersion?: (versionId: string, reason: string) => Promise<void>;
    sysRefresh?: SysRefresh;
    // Stable State Props
    pendingStage: 'idle' | 'saving' | 'awaiting_ack' | 'activating' | 'error' | 'success' | 'preflight_error';
    setPendingStage: (s: 'idle' | 'saving' | 'awaiting_ack' | 'activating' | 'error' | 'success' | 'preflight_error') => void;
    saveMessage: string;
    setSaveMessage: (m: string) => void;
    pendingPreflight: any;
    setPendingPreflight: (d: any) => void;
    pendingAck: boolean;
    setPendingAck: (b: boolean) => void;
    pendingCandidateVersionId: string | null;
    setPendingCandidateVersionId: (id: string | null) => void;
    dismissTimerRef: React.MutableRefObject<number | null>;
    setConfirmModal: React.Dispatch<React.SetStateAction<{ isOpen: boolean; title: string; message: string; onConfirm: () => void; }>>;
};

function ConfigSysadminView(props: ConfigSysadminViewProps) {
    const {
        bundleData,
        renderKnownPanel,
        activeVersionId,
        onCloneSysadminDraft,
        onActivateVersion,
        sysRefresh,
        pendingStage,
        setPendingStage,
        saveMessage,
        setSaveMessage,
        pendingPreflight,
        setPendingPreflight,
        pendingAck,
        setPendingAck,
        pendingCandidateVersionId,
        setPendingCandidateVersionId,
        dismissTimerRef,
        setConfirmModal
    } = props;
    const caps = useCapabilities();
    const isExpertMode = caps.devModeOverridesEnabled;
    void sysRefresh;

    const [selectedTabId, setSelectedTabId] = useState<string | null>(null);

    // Roadmap 7.1 Step 2.1: Local Sysadmin Draft State
    const [sysadminDraft, setSysadminDraft] = useState<{ blocks: Record<string, unknown> } | null>(null);
    const [sysadminDraftDirty, setSysadminDraftDirty] = useState(false);
    const [sysadminDraftError, setSysadminDraftError] = useState<string|null>(null);
    const [editingShellJson, setEditingShellJson] = useState("");
    
    // Step 7.2: Save State
    const [saveReason, setSaveReason] = useState("Sysadmin config edit");
    const [isSaving, setIsSaving] = useState(false);

    // Roadmap 7.3: Draft Tabs Editor
    const [newTabId, setNewTabId] = useState("");
    const [newTabLabel, setNewTabLabel] = useState("");
    const [newTabBlockIds, setNewTabBlockIds] = useState<string[]>([]);
    const [draggedTabIdx, setDraggedTabIdx] = useState<number | null>(null);
    
    // Roadmap 7.5: JSON Textarea Cursor Stats & Focus
    const [cursorStats, setCursorStats] = useState({ line: 1, col: 1, pos: 0 });
    const jsonTextareaRef = useRef<HTMLTextAreaElement>(null);

    const updateCursorStats = () => {
        const el = jsonTextareaRef.current;
        if (!el) return;
        const pos = el.selectionStart;
        const textUpTo = el.value.substring(0, pos);
        const lines = textUpTo.split('\n');
        const line = lines.length;
        const col = lines[lines.length - 1].length + 1;
        setCursorStats({ line, col, pos });
    };

    const handleJumpToError = (pos: number) => {
        if (jsonTextareaRef.current && typeof pos === 'number') {
             const jumpPos = Math.max(0, pos - 1); // Select ONE CHAR BEFORE the error token
             jsonTextareaRef.current.focus();
             jsonTextareaRef.current.setSelectionRange(jumpPos, jumpPos+1);
             // Rough scroll attempt
             const fullText = jsonTextareaRef.current.value;
             const lineNum = fullText.substring(0, jumpPos).split('\n').length;
             const lineHeight = 16; // approximate
             jsonTextareaRef.current.scrollTop = (lineNum - 3) * lineHeight; 
        }
    };
    
    // Roadmap 7.5.1: Text Search Jump for strings
    const handleJumpToText = (target: string, context?: string) => {
        if (!jsonTextareaRef.current || !target) return;
        const text = jsonTextareaRef.current.value;
        let startPos = 0;
        
        // Try to find context first (e.g. tab ID)
        if (context) {
            const ctxPos = text.indexOf(context);
            if (ctxPos !== -1) startPos = ctxPos;
        }
        
        const pos = text.indexOf(target, startPos);
        if (pos !== -1) {
             jsonTextareaRef.current.focus();
             jsonTextareaRef.current.setSelectionRange(pos, pos + target.length);
             const lineNum = text.substring(0, pos).split('\n').length;
             const lineHeight = 16; 
             jsonTextareaRef.current.scrollTop = (lineNum - 3) * lineHeight;
        }
    };

    // Roadmap 7.4: Draft Issue Navigator
    type DraftIssueSeverity = 'ERROR' | 'WARN' | 'INFO';
    interface DraftIssue {
        id: string; 
        severity: DraftIssueSeverity;
        code: string;
        message: string;
        path: string; 
        fixable: boolean;
        fixLabel?: string;
        fixData?: any; 
        copyToken?: string;
        // UX Enhancement
        tabContext?: string; 
        errorPos?: number;
        jumpData?: { target: string; context?: string; }; // For non-fixable text jumps
    }

    const [currentIssueIndex, setCurrentIssueIndex] = useState(0);

    const draftIssues = useMemo(() => {
        if (!sysadminDraft) return [];
        const issues: DraftIssue[] = [];
        let parsed: any;
        
        try {
            parsed = JSON.parse(editingShellJson);
        } catch (e: any) {
            // Attempt to extract position from "Unexpected token X in JSON at position Y"
            let pos = -1;
            const match = e.message.match(/position (\d+)/);
            if (match && match[1]) {
                pos = parseInt(match[1], 10);
            }

            const errIssue: DraftIssue = {
                id: 'parse_error',
                severity: 'ERROR',
                code: 'JSON_PARSE_ERROR',
                message: e.message || 'Invalid JSON',
                path: 'root',
                fixable: false,
                copyToken: e.message,
                errorPos: pos > -1 ? pos : undefined
            };
            return [errIssue];
        }

        const tabs = parsed?.data?.tabs;
        if (!tabs || !Array.isArray(tabs)) {
            issues.push({
                id: 'tabs_not_array',
                severity: 'ERROR',
                code: 'TABS_NOT_ARRAY',
                message: 'Required "tabs" array is missing or invalid.',
                path: 'data.tabs',
                fixable: false
            });
            return issues;
        }

        const seenIds = new Set<string>();

        tabs.forEach((t: any, idx: number) => {
            const path = `tabs[${idx}]`;
            
            // UX Context String
            let ctx = `Tab: (missing id/label)`;
            if (t.id && t.label) ctx = `Tab: ${t.label} (id="${t.id}")`;
            else if (t.id) ctx = `Tab id="${t.id}"`;
            else if (t.label) ctx = `Tab: ${t.label}`;

            const contextStr = t.id ? `"${t.id}"` : undefined;

            // D. TAB_ID_MISSING_OR_EMPTY
            if (!t.id) {
                issues.push({
                    id: `missing_id_${idx}`,
                    severity: 'ERROR',
                    code: 'TAB_ID_MISSING_OR_EMPTY',
                    message: `Tab at index ${idx} missing "id" property.`,
                    path: path,
                    fixable: false,
                    tabContext: ctx
                });
            } else {
                 // E. TAB_ID_DUPLICATE
                 if (seenIds.has(t.id)) {
                    issues.push({
                        id: `dup_id_${t.id}_${idx}`,
                        severity: 'ERROR',
                        code: 'TAB_ID_DUPLICATE',
                        message: `Duplicate Tab ID: "${t.id}"`,
                        path: path,
                        fixable: false,
                        copyToken: t.id,
                        tabContext: ctx,
                        jumpData: { target: `"${t.id}"` }
                    });
                 }
                 seenIds.add(t.id);
            }

            // F. TAB_LABEL_MISSING_OR_EMPTY
            if (!t.label) {
                issues.push({
                    id: `missing_label_${idx}`,
                    severity: 'WARN',
                    code: 'TAB_LABEL_MISSING_OR_EMPTY',
                    message: `Tab missing "label".`,
                    path: path,
                    fixable: !!t.id,
                    fixLabel: 'Add label',
                    fixData: { index: idx, id: t.id },
                    tabContext: ctx,
                    jumpData: t.id ? { target: `"${t.id}"` } : undefined
                });
            }

            // B. DEPRECATED_TAB_DEFAULT
            if (t.default !== undefined) {
                issues.push({
                    id: `dep_default_${idx}`,
                    severity: 'INFO',
                    code: 'DEPRECATED_TAB_DEFAULT',
                    message: '"default" property is deprecated.',
                    path: `${path}.default`,
                    fixable: true,
                    fixLabel: 'Remove field',
                    fixData: { index: idx },
                    copyToken: '"default"',
                    tabContext: ctx,
                    jumpData: { target: '"default"', context: contextStr }
                });
            }

            // G. CONTENT_BLOCK_IDS_NOT_ARRAY
            if (t.contentBlockIds && !Array.isArray(t.contentBlockIds)) {
                issues.push({
                    id: `content_not_array_${idx}`,
                    severity: 'WARN',
                    code: 'CONTENT_BLOCK_IDS_NOT_ARRAY',
                    message: 'contentBlockIds must be an array.',
                    path: `${path}.contentBlockIds`,
                    fixable: false,
                    tabContext: ctx
                });
            } else if (Array.isArray(t.contentBlockIds)) {
                // H. MISSING_BLOCK_ID
                t.contentBlockIds.forEach((bid: string, bidx: number) => {
                     // Check against bundleData directly
                     // Available panel blocks is just a filtered subset, we need to check existence in bundle
                     const exists = bundleData?.blocks && 
                        (Array.isArray(bundleData.blocks) 
                            ? (bundleData.blocks as any[]).some(b => (b.blockId === bid || b.id === bid))
                            : (bundleData.blocks as Record<string,any>)[bid]
                        );
                     
                     if (!exists) {
                         issues.push({
                             id: `missing_block_${idx}_${bidx}`,
                             severity: 'WARN',
                             code: 'MISSING_BLOCK_ID',
                             message: `Referenced block "${bid}" not found in bundle.`,
                             path: `${path}.contentBlockIds[${bidx}]`,
                             fixable: true,
                             fixLabel: 'Remove reference',
                             fixData: { index: idx, blockId: bid },
                             copyToken: bid,
                             tabContext: ctx,
                             jumpData: { target: `"${bid}"`, context: contextStr }
                         });
                     }
                });
            }

        });

        return issues;
    }, [editingShellJson, bundleData, sysadminDraft]);

    const handleFixIssue = (issue: DraftIssue) => {
        if (!issue.fixable || !issue.fixData) return;
        
        try {
            const parsed = JSON.parse(editingShellJson);
            const tabs = parsed.data.tabs;

            if (issue.code === 'DEPRECATED_TAB_DEFAULT') {
                 const t = tabs[issue.fixData.index];
                 if (t) {
                     delete t.default;
                 }
            } else if (issue.code === 'MISSING_BLOCK_ID') {
                 const t = tabs[issue.fixData.index];
                 if (t && Array.isArray(t.contentBlockIds)) {
                     const idx = t.contentBlockIds.indexOf(issue.fixData.blockId);
                     if (idx !== -1) t.contentBlockIds.splice(idx, 1);
                 }
            } else if (issue.code === 'TAB_LABEL_MISSING_OR_EMPTY') {
                 const t = tabs[issue.fixData.index];
                 if (t && issue.fixData.id && !t.label) {
                     // Simple Title Case Helper
                     const formatLabel = (s:string) => s
                        .replace(/([a-z])([A-Z])/g, '$1 $2')
                        .replace(/[_-]+/g, ' ')
                        .trim()
                        .split(/\s+/)
                        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                        .join(' ');
                        
                     t.label = formatLabel(issue.fixData.id);
                 }
            }

            // Sync
            const newJson = JSON.stringify(parsed, null, 2);
            setEditingShellJson(newJson);
            setSysadminDraftDirty(true);
            
            if (sysadminDraft) {
                 const root = findSysadminBlock(sysadminDraft.blocks);
                 const rootId = root.blockId || root.id;
                 const newBlocks = { ...sysadminDraft.blocks, [rootId]: parsed };
                 setSysadminDraft({ blocks: newBlocks });
            }

        } catch (e) {
            console.error("Failed to apply fix", e);
        }
    };
    
    // Helpers for Tabs Editor
    const availablePanelBlocks = useMemo(() => {
        if (!bundleData || !bundleData.blocks) return [];
        const blocks = Array.isArray(bundleData.blocks) ? bundleData.blocks : Object.values(bundleData.blocks);
        return blocks
            .map((b: any) => b.blockId || b.id || "")
            .filter((id: string) => id.startsWith('sysadmin_panel_') || id.startsWith('sysadmin.panel.'))
            .sort();
    }, [bundleData]);

    const draftTabs = useMemo(() => {
        if (!editingShellJson) return [];
        try {
            const parsed = JSON.parse(editingShellJson);
            if (parsed && parsed.data && Array.isArray(parsed.data.tabs)) {
                return parsed.data.tabs;
            }
        } catch {}
        return [];
    }, [editingShellJson]);

    const updateDraftTabs = (newTabs: any[]) => {
        try {
             const parsed = JSON.parse(editingShellJson);
             if (!parsed.data) parsed.data = {};
             parsed.data.tabs = newTabs;
             
             // Normalize again just in case
             newTabs.forEach((t: any) => {
                 if (t.content && !t.contentBlockIds) {
                     t.contentBlockIds = t.content;
                     delete t.content;
                 }
             });

             const newJson = JSON.stringify(parsed, null, 2);
             setEditingShellJson(newJson);
             setSysadminDraftDirty(true);
             
             // Sync to Preview immediately
             if (sysadminDraft) {
                 const root = findSysadminBlock(sysadminDraft.blocks);
                 const rootId = root.blockId || root.id;
                 const newBlocks = { ...sysadminDraft.blocks, [rootId]: parsed };
                 setSysadminDraft({ blocks: newBlocks });
             }
        } catch(e) {
            console.error(e);
        }
    };

    const addDraftTab = () => {
        if (!newTabId || !newTabLabel) return;
        const newTab = {
            id: newTabId,
            label: newTabLabel,
            layout: 'dashboard',
            contentBlockIds: [...newTabBlockIds]
        };
        updateDraftTabs([...draftTabs, newTab]);
        setNewTabId("");
        setNewTabLabel("");
        setNewTabBlockIds([]);
    };
    
    // Legacy local state removed in favor of hoisted props

    const handleCreateDraft = () => {
        if (!bundleData) return;
        const blocksData = bundleData.blocks as any;
        const list = Array.isArray(blocksData) ? blocksData : Object.values(blocksData);
        
        const root = findSysadminBlock(blocksData);
        if (!root) return;
        
        const draftBlocks: Record<string, unknown> = {};
        const addBlock = (id: string) => {
            const b = list.find((x:any) => (x.blockId||x.id) === id);
            if (b) draftBlocks[id] = deepClone(b);
        };

        const rootId = root.blockId || root.id;
        addBlock(rootId);

        // Normalize Root Block for the editor (Roadmap #6)
        if (draftBlocks[rootId] && (draftBlocks[rootId] as any).data && Array.isArray((draftBlocks[rootId] as any).data.tabs)) {
             (draftBlocks[rootId] as any).data.tabs.forEach((t: any) => {
                 if (t.content && !t.contentBlockIds) {
                     t.contentBlockIds = t.content;
                     delete t.content;
                 }
             });
        }

        try {
            const parsed = parseSysadminConfig(root);
            if (parsed && parsed.tabs) {
                parsed.tabs.forEach((t:any) => t.contentBlockIds.forEach((bid:any) => addBlock(bid)));
            }
        } catch (e) { /* ignore */ }

        setSysadminDraft({ blocks: draftBlocks });
        setEditingShellJson(JSON.stringify(draftBlocks[rootId], null, 2));
        setSysadminDraftDirty(true);
        setSysadminDraftError(null);
    };

    const handleUpdateDraft = () => {
        try {
            const parsed = JSON.parse(editingShellJson);

            // Normalize on save/update (Roadmap #6)
            if (parsed && parsed.data && Array.isArray(parsed.data.tabs)) {
                 parsed.data.tabs.forEach((t: any) => {
                     if (t.content && !t.contentBlockIds) {
                         t.contentBlockIds = t.content;
                         delete t.content;
                     }
                 });
            }

            if (!sysadminDraft) return;
            const root = findSysadminBlock(sysadminDraft.blocks);
            const rootId = root.blockId || root.id;
            
            const newBlocks = { ...sysadminDraft.blocks, [rootId]: parsed };
            setSysadminDraft({ blocks: newBlocks });
            setSysadminDraftError(null);
        } catch (e: any) {
            setSysadminDraftError(e.message);
        }
    };

    const handleDiscardDraft = () => {
        setSysadminDraft(null);
        setSysadminDraftDirty(false);
        setSysadminDraftError(null);
        setEditingShellJson("");
        // NOTE: We do NOT clear pendingStage/saveMessage here logic handled in cancel
    };

    const handleCancel = () => {
        setPendingStage('idle');
        setSaveMessage('');
        setPendingPreflight(null);
        setPendingAck(false);
        setPendingCandidateVersionId(null);
        setIsSaving(false);
    };

    const handleSaveToServer = async () => {
        if (!sysadminDraft || !onCloneSysadminDraft || !onActivateVersion) return;
        
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);

        const draftReason = saveReason || "Sysadmin config edit";

        // PHASE 2: Activation (Second Click)
        if (pendingStage === 'awaiting_ack') {
             if (!pendingAck || !pendingCandidateVersionId) return; 
             
             try {
                setPendingStage('activating');
                setSaveMessage('Activating confirmed version...');
                setIsSaving(true);

                await onActivateVersion(pendingCandidateVersionId, draftReason);
                
                setPendingStage('success');
                setSaveMessage(`Successfully activated ${pendingCandidateVersionId}`);
                
                handleDiscardDraft();
                
                 // Auto-dismiss REMOVED for stability
                setPendingCandidateVersionId(null);

             } catch (e: any) {
                 setPendingStage('error');
                 setSaveMessage(e.message || "Activation failed");
             } finally {
                 setIsSaving(false);
             }
             return;
        }

        // PHASE 1: Clone & Preflight (First Click)
        
        // Reset UI state for fresh attempt
        setPendingStage('saving');
        setSaveMessage('Running preflight checks...');
        setSysadminDraftError(null);
        setPendingPreflight(null);
        setPendingAck(false);
        setPendingCandidateVersionId(null);
        setIsSaving(true); 

        try {
            // Ensure draft is fresh
            handleUpdateDraft(); 

            // 1. Clone (Generate Candidate)
            const newVersionId = await onCloneSysadminDraft(sysadminDraft.blocks, draftReason);
            setPendingCandidateVersionId(newVersionId);

            // 2. Preflight on CANDIDATE version (Standard Governed Endpoint)
            // Note: Now utilizing /api/config/shell/preflight (non-debug)
            
            const pfRes = await fetch(apiUrl(`/api/config/shell/preflight/${newVersionId}`));
            if (!pfRes.ok) throw new Error("Preflight request failed");
            const pfData = await pfRes.json();
            
            setPendingPreflight(pfData);

            // Gating Logic
            const hasBlockers = !pfData.canActivate || (pfData.summary?.A1 > 0) || (pfData.summary?.A2 > 0);
            const hasWarnings = (pfData.summary?.B > 0);

            if (hasBlockers) {
                setPendingStage('error');
                setSaveMessage('Preflight BLOCKED — cannot save/activate.');
                setIsSaving(false);
                return; // Abort
            }

            if (hasWarnings) {
                setPendingStage('awaiting_ack');
                setSaveMessage('Preflight Warning: Issues detected that requires acknowledgement.');
                setIsSaving(false);
                return; // Abort first pass, wait for user ack
            }

            // 3. Activate (Direct path if safe)
            setPendingStage('activating');
            setSaveMessage('Activating...');

            await onActivateVersion(newVersionId, draftReason);
            
            // Success
            setPendingStage('success');
            setSaveMessage(`Saved & activated. New version: ${newVersionId}`);
            
            // Clear draft state on success
            handleDiscardDraft();
            setPendingCandidateVersionId(null); // Clear candidate after success

            // Auto-dismiss REMOVED for stability
        } catch (e: any) {
            setPendingStage('error');
            setSaveMessage(e.message || "Error saving draft");
            // Do not clear draft
        } finally {
            setIsSaving(false);
        }
    };

    const config = useMemo(() => {
        const sourceBlocks = sysadminDraft ? sysadminDraft.blocks : (bundleData && bundleData.blocks);
        const sourceRoot = sourceBlocks ? findSysadminBlock(sourceBlocks) : null;
        // Fallback or use found block logic
        return sourceRoot ? parseSysadminConfig(sourceRoot) : null;
    }, [bundleData, sysadminDraft]);

    // Roadmap 6.3: Auto-select Default Sub-Tab
    useEffect(() => {
        if (!config) return;

        const currentTabExists = selectedTabId && config.tabs.some(t => t.id === selectedTabId);

        if (!selectedTabId || !currentTabExists) {
             let targetId = config.defaultTabId;
             
             // Check rawBlock for "default: true" on tabs (ConfigSysadminView logic)
             if (!targetId && config.rawBlock && config.rawBlock.data && Array.isArray(config.rawBlock.data.tabs)) {
                  const defTab = config.rawBlock.data.tabs.find((t:any) => t.default === true);
                   void defTab;
             }
             
             // Fallback to first tab
             if (!targetId && config.tabs.length > 0) {
                 targetId = config.tabs[0].id;
             }
             
             if (targetId && targetId !== selectedTabId) {
                 setSelectedTabId(targetId);
             }
        }
    }, [config, selectedTabId]);

    if (!bundleData) return <div style={{padding:'20px', color:'#666'}}>Load bundle first</div>;
    if (!config) return <div style={{padding:'20px', color:'#666'}}>No sysadmin.shell config found (Recovery Sysadmin in use).</div>;

    const activeTab = config.tabs.find(t => t.id === selectedTabId) || config.tabs[0];

    const renderDraftHeader = () => {
        if (!sysadminDraft) {
            return (
                <button onClick={handleCreateDraft} style={{fontSize:'0.75em', width:'100%', marginBottom:'8px', cursor:'pointer'}}>
                    Create Local Draft
                </button>
            );
        }

        return (
            <div style={{marginBottom:'8px', borderBottom:'1px solid #ffe0b2', paddingBottom:'8px'}}>
                <div style={{color:'#e65100', fontSize:'0.85em', fontWeight:'bold', display:'flex', alignItems:'center', gap:'4px'}}>
                    <span>✎ DRAFT MODE</span>
                </div>
                <div style={{fontSize:'0.75em', color:'#e65100', marginBottom:'5px'}}>
                    Local changes only {activeVersionId ? '(Base: ' + activeVersionId + ')' : ''}
                </div>
                <div style={{marginBottom:'5px'}}>
                    <input 
                        type="text" 
                        placeholder="Change reason..."
                        value={saveReason}
                        onChange={e => setSaveReason(e.target.value)}
                        style={{width:'100%', padding:'4px', fontSize:'0.8em', border:'1px solid #ffe0b2', boxSizing:'border-box'}}
                    />
                    <button 
                        onClick={handleSaveToServer}
                        disabled={isSaving || (pendingStage === 'awaiting_ack' && !pendingAck)}
                        style={{
                            width:'100%', 
                            marginTop:'4px', 
                            padding:'4px', 
                            cursor: (isSaving || (pendingStage === 'awaiting_ack' && !pendingAck)) ? 'default' : 'pointer',
                            background: pendingStage === 'awaiting_ack' ? '#f57c00' : '#e65100',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            fontSize: '0.8em',
                            fontWeight: 'bold'
                        }}
                    >
                        {isSaving ? 'Saving...' : (pendingStage === 'awaiting_ack' ? 'Confirm Save & Activate' : 'Save & Activate')}
                    </button>
                </div>
                <button onClick={handleDiscardDraft} disabled={isSaving} style={{fontSize:'0.75em', width:'100%', cursor:'pointer', marginTop:'4px'}}>Discard Draft</button>
            </div>
        );
    };

    return (
        <div style={{display:'flex', height:'100%', border:'1px solid #ddd'}}>
            {/* Left Column: Tab List */}
            <div style={{width:'200px', borderRight:'1px solid #ddd', background:'#f9f9f9', overflowY:'auto'}}>
                <div
                    style={{
                        padding:'10px',
                        borderBottom:'1px solid #eee',
                        fontWeight:'bold',
                        fontSize:'0.9em',
                        background: sysadminDraft ? '#fff3e0' : '#eee'
                    }}
                >
                    {renderDraftHeader()}
                    {config.title}
                </div>
                {config.tabs.map(t => {
                    const isSel = activeTab && activeTab.id === t.id;
                    return (
                        <div 
                            key={t.id}
                            onClick={() => setSelectedTabId(t.id)}
                            style={{
                                padding:'8px 10px', 
                                cursor:'pointer',
                                background: isSel ? '#e3f2fd' : 'transparent',
                                color: isSel ? '#1565c0' : '#333',
                                borderBottom:'1px solid #eee',
                                fontSize:'0.9em'
                            }}
                        >
                            <div style={{fontWeight:'bold'}}>{t.label}</div>
                            <div style={{fontSize:'0.8em', color:'#666'}}>{t.contentBlockIds.length} blocks</div>
                        </div>
                    );
                })}
                
                {/* Special View: Features & Slots */}
                <div 
                    onClick={() => setSelectedTabId('features-slots')}
                    style={{
                        padding:'8px 10px', 
                        cursor:'pointer',
                        background: selectedTabId === 'features-slots' ? '#e8f5e9' : 'transparent',
                        color: selectedTabId === 'features-slots' ? '#2e7d32' : '#333',
                        borderBottom:'1px solid #eee',
                        fontSize:'0.9em',
                        marginTop: '10px',
                        borderTop: '2px solid #ddd'
                    }}
                >
                    <div style={{fontWeight:'bold'}}>Features & Slots</div>
                    <div style={{fontSize:'0.8em', color:'#666'}}>Config Registry</div>
                </div>

            </div>

            {/* Right Column: Tab Details */}
            <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden'}}>
                {sysadminDraft && (
                    <div style={{padding:'10px', background:'#fff8e1', borderBottom:'1px solid #ffe0b2'}}>
                        <div style={{marginBottom:'10px', borderBottom:'1px dashed #ffe0b2', paddingBottom:'10px'}}>
                            <strong style={{color:'#e65100', fontSize:'0.9em'}}>Tabs Editor (Visual)</strong>
                            
                            {!isExpertMode && (
                                <div style={{marginTop:'5px', padding:'6px', background:'#fff3cd', color:'#856404', borderRadius:'4px', border:'1px solid #ffeeba', fontSize:'0.85em'}}>
                                    <strong>Expert Mode is OFF (server policy).</strong><br/>
                                    Editing is disabled because devModeOverridesEnabled is false.<br/>
                                    <div style={{marginTop:'4px', fontSize:'0.9em', opacity: 0.8}}>
                                        Capabilities: devModeOverridesEnabled=false
                                    </div>
                                    {(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
                                         <div style={{marginTop:'8px', borderTop:'1px dotted #856404', paddingTop:'4px', fontStyle:'italic'}}>
                                            Dev hint: enable FOLE_DEV_ALLOW_MODE_OVERRIDES=1 to allow Expert Mode.
                                         </div>
                                    )}
                                </div>
                            )}

                            {isExpertMode && (
                                 <div style={{marginTop:'5px', padding:'6px', background:'#e1f5fe', color:'#01579b', borderRadius:'4px', border:'1px solid #b3e5fc', fontSize:'0.85em'}}>
                                    <strong>Expert Mode Active</strong><br/>
                                    Use caution. Changes affect all sysadmins.
                                </div>
                            )}

                            <div style={{display:'flex', flexDirection:'column', gap:'4px', marginTop:'5px'}}>
                                {draftTabs.map((t:any, idx:number) => {
                                    const isDragged = draggedTabIdx === idx;
                                    return (
                                    <div 
                                        key={t.id || idx}
                                        draggable={!!sysadminDraft && isExpertMode}
                                        onDragStart={(e) => {
                                            if(!sysadminDraft) return;
                                            setDraggedTabIdx(idx);
                                            e.dataTransfer.effectAllowed = "move";
                                        }}
                                        onDragOver={(e) => {
                                            if(draggedTabIdx === null) return;
                                            e.preventDefault(); 
                                            e.dataTransfer.dropEffect = "move";
                                        }}
                                        onDrop={(e) => {
                                            if(draggedTabIdx === null) return;
                                            e.preventDefault();
                                            if (draggedTabIdx === idx) return;
                                            
                                            const nt = [...draftTabs];
                                            const [removed] = nt.splice(draggedTabIdx, 1);
                                            nt.splice(idx, 0, removed);
                                            
                                            updateDraftTabs(nt);
                                            setDraggedTabIdx(null);
                                        }}
                                        onDragEnd={() => setDraggedTabIdx(null)}
                                        style={{
                                            display:'flex', alignItems:'center', gap:'8px', fontSize:'0.85em', 
                                            background: isDragged ? '#e3f2fd' : 'rgba(255,255,255,0.5)', 
                                            padding:'4px', 
                                            border: isDragged ? '1px dashed #2196f3' : '1px solid rgba(0,0,0,0.05)',
                                            opacity: isDragged ? 0.6 : 1,
                                            cursor: (sysadminDraft && isExpertMode) ? 'grab' : 'default'
                                        }}
                                    >
                                        <div style={{color:'#bbb', fontSize:'1.2em', lineHeight:'1', userSelect:'none', padding:'0 4px', cursor:'grab'}} title="Drag to reorder">≡</div>
                                        <div style={{display:'flex', flexDirection:'column'}}>
                                            <button onClick={() => {
                                                const nt = [...draftTabs];
                                                if (idx > 0) {
                                                    [nt[idx], nt[idx-1]] = [nt[idx-1], nt[idx]];
                                                    updateDraftTabs(nt);
                                                }
                                            }} disabled={idx===0 || !isExpertMode} style={{fontSize:'0.6em', lineHeight:'1', padding:'0 2px', cursor:'pointer'}}>▲</button>
                                            <button onClick={() => {
                                                const nt = [...draftTabs];
                                                if (idx < draftTabs.length-1) {
                                                    [nt[idx], nt[idx+1]] = [nt[idx+1], nt[idx]];
                                                    updateDraftTabs(nt);
                                                }
                                            }} disabled={idx===draftTabs.length-1 || !isExpertMode} style={{fontSize:'0.6em', lineHeight:'1', padding:'0 2px', cursor:'pointer'}}>▼</button>
                                        </div>
                                        <div style={{flex:1}}>
                                            <span style={{fontWeight:'bold'}}>{t.label}</span>
                                            <span style={{marginLeft:'5px', color:'#666', fontFamily:'monospace'}}>{t.id}</span>
                                            <span style={{marginLeft:'5px', fontSize:'0.8em', color:'#999'}}>({(t.contentBlockIds||[]).length} blocks)</span>
                                        </div>
                                        <button onClick={() => { 
                                            setConfirmModal({
                                                isOpen: true,
                                                title: "Delete Tab",
                                                message: "Are you sure you want to delete this tab?",
                                                onConfirm: () => {
                                                    const nt = [...draftTabs];
                                                    nt.splice(idx,1);
                                                    updateDraftTabs(nt);
                                                    setConfirmModal((p:any)=>({...p, isOpen:false}));
                                                }
                                            });
                                        }} disabled={!isExpertMode} style={{color: isExpertMode ? '#c62828' : '#ccc', border:'none', background:'none', cursor: isExpertMode ? 'pointer' : 'default', fontWeight:'bold'}}>×</button>
                                    </div>
                                    );
                                })}
                            </div>
                            
                            <div style={{marginTop:'8px', display:'flex', gap:'5px', alignItems:'center', flexWrap:'wrap', background:'rgba(255,255,255,0.5)', padding:'4px'}}>
                                <input placeholder="ID (e.g. tools)" value={newTabId} onChange={e=>setNewTabId(e.target.value)} disabled={!isExpertMode} style={{width:'80px', fontSize:'0.8em', padding:'2px', background: !isExpertMode?'#eee':'#fff'}} />
                                <input placeholder="Label" value={newTabLabel} onChange={e=>setNewTabLabel(e.target.value)} disabled={!isExpertMode} style={{width:'100px', fontSize:'0.8em', padding:'2px', background: !isExpertMode?'#eee':'#fff'}} />
                                <select 
                                    multiple 
                                    style={{height:'40px', fontSize:'0.7em', width:'150px', background: !isExpertMode?'#eee':'#fff'}} 
                                    value={newTabBlockIds} 
                                    onChange={e => setNewTabBlockIds(Array.from(e.target.selectedOptions, o => o.value))}
                                    title="Hold Ctrl/Cmd to select multiple"
                                    disabled={!isExpertMode}
                                >
                                    {availablePanelBlocks.map((bid:string) => <option key={bid} value={bid}>{bid}</option>)}
                                </select>
                                <button onClick={addDraftTab} disabled={!newTabId||!newTabLabel || !isExpertMode} style={{fontSize:'0.8em', cursor: (!newTabId||!newTabLabel||!isExpertMode) ? 'default' : 'pointer'}}>+ Add Tab</button>
                            </div>
                        </div>

                        {draftIssues.length > 0 && (
                            <div style={{marginBottom:'10px', background:'#fff', padding:'5px', border:'1px solid #ccc'}}>
                                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', background:'#f0f0f0', padding:'4px', fontSize:'0.85em', fontWeight:'bold'}}>
                                    <span>
                                        Issues: {draftIssues.length} 
                                        <span style={{fontWeight:'normal', marginLeft:'5px'}}>
                                            ({draftIssues.filter(i=>i.severity==='ERROR').length} err, {draftIssues.filter(i=>i.severity==='WARN').length} warn)
                                        </span>
                                    </span>
                                    <div style={{display:'flex', gap:'5px'}}>
                                        <button disabled={currentIssueIndex<=0} onClick={() => setCurrentIssueIndex(p => Math.max(0, p-1))} style={{cursor:'pointer'}}>Prev</button>
                                        <span>{currentIssueIndex+1} / {draftIssues.length}</span>
                                        <button disabled={currentIssueIndex>=draftIssues.length-1} onClick={() => setCurrentIssueIndex(p => Math.min(draftIssues.length-1, p+1))} style={{cursor:'pointer'}}>Next</button>
                                    </div>
                                </div>
                                {draftIssues[currentIssueIndex] && (
                                    <div style={{padding:'8px', fontSize:'0.9em', display:'flex', flexDirection:'column', gap:'4px'}}>
                                        <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                                            <span style={{
                                                fontSize:'0.75em', padding:'2px 4px', borderRadius:'3px', fontWeight:'bold',
                                                color: draftIssues[currentIssueIndex].severity === 'WARN' ? 'black' : 'white',
                                                background: draftIssues[currentIssueIndex].severity==='ERROR' ? '#d32f2f' : (draftIssues[currentIssueIndex].severity==='WARN' ? '#ffcc80' : '#1976d2')
                                            }}>{draftIssues[currentIssueIndex].severity}</span>
                                            <span style={{fontWeight:'bold'}}>{draftIssues[currentIssueIndex].message}</span>
                                        </div>
                                        {draftIssues[currentIssueIndex].tabContext && (
                                            <div style={{fontSize:'0.85em', color:'#e65100', fontWeight:'bold'}}>
                                                {draftIssues[currentIssueIndex].tabContext}
                                            </div>
                                        )}
                                        <div style={{fontFamily:'monospace', color:'#666', fontSize:'0.85em'}}>path: {draftIssues[currentIssueIndex].path}</div>
                                        <div style={{display:'flex', gap:'10px', marginTop:'4px'}}>
                                            {draftIssues[currentIssueIndex].copyToken && (
                                                <button 
                                                    onClick={() => navigator.clipboard.writeText(draftIssues[currentIssueIndex].copyToken!)}
                                                    style={{cursor:'pointer', fontSize:'0.8em', padding: '2px 5px'}}
                                                >
                                                    Copy Token
                                                </button>
                                            )}
                                            {draftIssues[currentIssueIndex].errorPos !== undefined && (
                                                 <button 
                                                     onClick={() => {
                                                         const p = draftIssues[currentIssueIndex].errorPos;
                                                         if(p!==undefined) handleJumpToError(p);
                                                     }}
                                                     style={{cursor:'pointer', fontSize:'0.8em', background:'#fff9c4', border:'1px solid #fbc02d', color: '#000', fontWeight:'bold', padding: '2px 5px'}}
                                                 >
                                                     Jump to Error
                                                 </button>
                                            )}
                                            {draftIssues[currentIssueIndex].jumpData && (
                                                <button 
                                                    onClick={() => {
                                                        const { target, context } = draftIssues[currentIssueIndex].jumpData!;
                                                        handleJumpToText(target, context);
                                                    }}
                                                    style={{cursor:'pointer', fontSize:'0.8em', background:'#e1f5fe', border:'1px solid #039be5', color: '#01579b', fontWeight:'bold', padding: '2px 5px'}}
                                                >
                                                    Jump to Code
                                                </button>
                                            )}
                                            {draftIssues[currentIssueIndex].fixable && (
                                                <button 
                                                    onClick={() => handleFixIssue(draftIssues[currentIssueIndex])}
                                                    style={{cursor:'pointer', fontSize:'0.8em', background:'#e8f5e9', border:'1px solid #a5d6a7', color:'#000', fontWeight:'bold', padding: '2px 5px'}}
                                                >
                                                    Fix: {draftIssues[currentIssueIndex].fixLabel}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'5px'}}>
                            <strong style={{fontSize:'0.9em', color:'#e65100'}}>Raw JSON</strong>
                            <div style={{fontSize:'0.75em', color:'#666', fontFamily:'monospace'}}>
                                Cursor: Ln {cursorStats.line}, Col {cursorStats.col}, Pos {cursorStats.pos}
                            </div>
                            <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
                                {sysadminDraftError && <span style={{color:'#d32f2f', fontSize:'0.8em', fontWeight:'bold'}}>{sysadminDraftError}</span>}
                                {sysadminDraftDirty && <span style={{fontSize:'0.8em', color:'#e65100', fontStyle:'italic'}}>Unsaved to draft</span>}
                                <button onClick={handleUpdateDraft} disabled={!isExpertMode} style={{cursor: isExpertMode ? 'pointer' : 'default', fontSize:'0.85em', opacity: isExpertMode ? 1 : 0.5}}>Update & Preview</button>
                            </div>
                        </div>
                        <textarea 
                            ref={jsonTextareaRef}
                            value={editingShellJson}
                            disabled={!isExpertMode}
                            onClick={updateCursorStats}
                            onKeyUp={updateCursorStats}
                            onChange={(e) => { 
                                setEditingShellJson(e.target.value); 
                                setSysadminDraftDirty(true); 
                            }}
                            style={{width:'100%', height:'120px', fontFamily:'monospace', fontSize:'0.85em', resize:'vertical', padding:'5px', background: !isExpertMode ? '#eee' : '#fff'}}
                            spellCheck={false}
                        />
                    </div>
                )}
                {selectedTabId === 'features-slots' ? (
                     (() => {
                        const sourceBlocks = sysadminDraft ? sysadminDraft.blocks : (bundleData.blocks || {});
                        const features = Object.values(sourceBlocks).filter((b:any) => b.blockType === 'feature.group');
                        const slots = Object.values(sourceBlocks).filter((b:any) => b.blockType === 'shell.slot.item');
                        const slotsById: Record<string, any[]> = {};
                        slots.forEach((s:any) => {
                            const sid = s.data?.slotId || 'unknown';
                            if(!slotsById[sid]) slotsById[sid] = [];
                            slotsById[sid].push(s);
                        });
                        return <FeaturesSlotsView features={features} slotsById={slotsById} />;
                    })()
                ) : activeTab ? (
                    <>
                        <div style={{padding:'10px', borderBottom:'1px solid #eee', background:'#fff'}}>
                            <strong style={{fontSize:'1.1em'}}>{activeTab.label}</strong>
                            <div style={{fontSize:'0.85em', color:'#666'}}>Layout: {activeTab.layout} | ID: {activeTab.id}</div>
                            <div style={{fontSize:'0.8em', color:'#888', marginTop:'2px'}}>Source: sysadmin.shell: {config.rawBlock.blockId || config.rawBlock.id}</div> 
                        </div>
                        <div style={{flex:1, overflowY:'auto', padding:'10px'}}>
                            
                            {pendingStage !== 'idle' && (
                                <div style={{
                                    marginBottom: '15px',
                                    padding: '10px',
                                    borderRadius: '4px',
                                    background: pendingStage === 'success' ? '#e8f5e9' : (pendingStage === 'error' || pendingStage === 'preflight_error' ? '#ffebee' : (pendingStage === 'awaiting_ack' ? '#fff3e0' : '#e3f2fd')),
                                    border: `1px solid ${pendingStage === 'success' ? '#c8e6c9' : (pendingStage === 'error' || pendingStage === 'preflight_error' ? '#ffcdd2' : (pendingStage === 'awaiting_ack' ? '#ffe0b2' : '#bbdefb'))}`,
                                    color: pendingStage === 'success' ? '#2e7d32' : (pendingStage === 'error' || pendingStage === 'preflight_error' ? '#c62828' : (pendingStage === 'awaiting_ack' ? '#e65100' : '#0d47a1')),
                                }}>
                                    
                                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                                        <div style={{fontSize:'0.9em', fontWeight:'bold'}}>
                                            {pendingStage === 'saving' && 'Saving...'}
                                            {pendingStage === 'activating' && 'Activating...'}
                                            {pendingStage === 'success' && '✓ Success: '}
                                            {pendingStage === 'error' && '⚠ Error: '}
                                            {pendingStage === 'preflight_error' && '🚫 Preflight Failed: '}
                                            {pendingStage === 'awaiting_ack' && '⚠ Preflight Warnings: '}
                                            <span style={{fontWeight:'normal'}}>{saveMessage}</span>
                                        </div>
                                        {pendingStage !== 'saving' && pendingStage !== 'activating' && (
                                            <button 
                                                onClick={() => { setPendingStage('idle'); setSaveMessage(''); setPendingPreflight(null); setPendingAck(false); setPendingCandidateVersionId(null); }}
                                                style={{
                                                    background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2em', lineHeight: '1', padding: '0 5px',
                                                    color: 'inherit', opacity: 0.6
                                                }}
                                                title="Dismiss"
                                            >
                                                ×
                                            </button>
                                        )}
                                    </div>

                                    {(pendingStage === 'preflight_error' || pendingStage === 'awaiting_ack') && pendingPreflight && (
                                        <div style={{marginTop:'8px', fontSize:'0.85em'}}>
                                            {pendingPreflight.errors && pendingPreflight.errors.length > 0 && (
                                                <div style={{marginBottom:'5px'}}>
                                                    <strong>Errors:</strong>
                                                    <ul style={{margin:'2px 0 0 0', paddingLeft:'20px'}}>
                                                        {pendingPreflight.errors.slice(0,5).map((e:any, i:number) => (
                                                            <li key={i}>{e.message} ({e.blockId})</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                            {pendingPreflight.warnings && pendingPreflight.warnings.length > 0 && (
                                                <div style={{marginBottom:'5px'}}>
                                                    <strong>Warnings:</strong>
                                                    <ul style={{margin:'2px 0 0 0', paddingLeft:'20px'}}>
                                                        {pendingPreflight.warnings.slice(0,5).map((e:any, i:number) => (
                                                            <li key={i}>{e.message} ({e.blockId})</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                            
                                            {pendingStage === 'awaiting_ack' && (
                                                <div style={{marginTop:'10px', paddingTop:'10px', borderTop:'1px solid rgba(0,0,0,0.1)'}}>
                                                    <label style={{display:'flex', alignItems:'center', gap:'5px', cursor:'pointer', fontWeight:'bold'}}>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={pendingAck} 
                                                            onChange={e => setPendingAck(e.target.checked)} 
                                                        />
                                                        I acknowledge these warnings and wish to proceed.
                                                    </label>
                                                    <div style={{marginTop:'8px', display:'flex', gap:'10px'}}>
                                                        <button 
                                                            onClick={handleSaveToServer}
                                                            disabled={!pendingAck}
                                                            style={{
                                                                background: pendingAck ? '#e65100' : '#ccc',
                                                                color: 'white', border:'none', borderRadius:'3px', padding:'4px 8px', cursor: pendingAck ? 'pointer' : 'default', fontWeight:'bold'
                                                            }}
                                                        >
                                                            Confirm Save & Activate
                                                        </button>
                                                        <button 
                                                            onClick={handleCancel}
                                                            style={{
                                                                background: '#ffffff', border:'1px solid #ccc', borderRadius:'3px', padding:'4px 8px', cursor:'pointer'
                                                            }}
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                </div>
                            )}


                            <details>
                                <summary style={{cursor:'pointer', color:'#007acc', fontWeight:'bold', marginBottom:'10px'}}>
                                    Raw Configuration
                                </summary>
                                <div style={{paddingLeft:'10px', borderLeft:'2px solid #eee'}}>
                                    <h4 style={{marginTop:0, borderBottom:'1px solid #eee'}}>Tab Configuration</h4>
                                    <pre style={{background:'#f5f5f5', padding:'10px', borderRadius:'4px', overflowX:'auto', fontSize:'0.85em'}}>
                                        {JSON.stringify(activeTab, null, 2)}
                                    </pre>

                                    <h4 style={{borderBottom:'1px solid #eee'}}>Referenced Blocks</h4>
                                    {activeTab.contentBlockIds.map(bid => {
                                        const block = (bundleData.blocks as any)[bid] || (Array.isArray(bundleData.blocks) ? (bundleData.blocks as any[]).find(b => b.blockId === bid || b.id === bid) : null);
                                        return (
                                            <div key={bid} style={{marginBottom:'15px', border:'1px solid #eee', borderRadius:'4px'}}>
                                                <div style={{background:'#f0f0f0', padding:'5px 10px', borderBottom:'1px solid #eee', display:'flex', justifyContent:'space-between'}}>
                                                    <strong>{bid}</strong>
                                                    {block ? <span style={{fontSize:'0.85em', color:'#2e7d32'}}>{block.blockType}</span> : <span style={{color:'red', fontWeight:'bold'}}>MISSING</span>}
                                                </div>
                                                {block ? (
                                                    <pre style={{margin:0, padding:'10px', fontSize:'0.8em', overflowX:'auto'}}>
                                                        {JSON.stringify(block, null, 2)}
                                                    </pre>
                                                ) : (
                                                    <div style={{padding:'10px', color:'#d32f2f', background:'#ffebee'}}>
                                                        Error: Block "{bid}" is referenced but not found in bundle.
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </details>

                            {/* Rendered Panel Section */}
                            <div style={{marginTop:'20px', borderTop:'1px solid #eee', paddingTop:'15px'}}>
                                <h4 style={{marginTop:0, marginBottom:'10px', color:'#333'}}>Rendered Panel</h4>
                                
                                {renderKnownPanel && activeTab.contentBlockIds.map(bid => {
                                    const blocks: any = bundleData.blocks;
                                    const block = blocks[bid] || (Array.isArray(blocks) ? blocks.find((b: any) => b.blockId === bid || b.id === bid) : null);
                                    
                                    if (!block) {
                                        return <div key={bid} style={{color:'red', padding:'10px', border:'1px solid red', borderRadius:'4px', marginBottom:'10px'}}>MISSING block: {bid}</div>;
                                    }

                                    const content = renderKnownPanel(block.blockType);
                                    
                                    if (!content) {
                                        return (
                                            <div key={bid} style={{padding:'8px', background:'#fff3e0', color:'#e65100', borderRadius:'4px', marginBottom:'10px', fontSize:'0.9em'}}>
                                                No renderer registered for blockType: <strong>{block.blockType}</strong>
                                            </div>
                                        );
                                    }
                                    
                                    return <div key={bid} style={{marginBottom:'20px'}}>{content}</div>;
                                })}
                            </div>
                        </div>
                    </>
                ) : (
                    <div style={{padding:'20px', color:'#666'}}>Select a tab to view details.</div>
                )}
            </div>
        </div>
    );
}

// --- Helper for Schema Driven Form ---
interface FieldDef {
  path: string;
  title: string;
  description?: string;
  help?: string;
  enumOptions?: string[];
  type: 'string' | 'boolean';
  required?: boolean;
  minLength?: number;
}

const isMultilineField = (nodeType: string, fieldPath: string) => {
    // Specific fields that should render as textarea
    if (nodeType === 'ui.node.text' && (fieldPath === 'content' || fieldPath.endsWith('.content'))) return true;
    if (nodeType === 'ui.node.button' && (fieldPath === 'helpText' || fieldPath.endsWith('.helpText'))) return true;
    return false;
};

const AutoGrowTextArea = ({ value, onChange, placeholder, style }: any) => {
    const ref = useRef<HTMLTextAreaElement>(null);
    const adjustHeight = () => {
        if (ref.current) {
            ref.current.style.height = 'auto'; // Reset to calculate scrollHeight
            const scroll = ref.current.scrollHeight;
            const max = 240;
            if (scroll > max) {
                ref.current.style.height = max + 'px';
                ref.current.style.overflowY = 'auto';
            } else {
                ref.current.style.height = scroll + 'px';
                ref.current.style.overflowY = 'hidden';
            }
        }
    };
    
    // Adjust on value change
    useEffect(() => {
        adjustHeight();
    }, [value]);

    return (
        <textarea
            ref={ref}
            value={value}
            onChange={(e) => { onChange(e); adjustHeight(); }}
            placeholder={placeholder}
            style={{ 
                ...style, 
                resize: 'none',
                fontFamily: 'inherit',
                lineHeight: '1.4'
            }}
            rows={1}
        />
    );
};

const extractStringFields = (schema: any, prefix = ""): FieldDef[] => {
  let fields: FieldDef[] = [];
  if (!schema || !schema.properties) return fields;

  const requiredKeys = Array.isArray(schema.required) ? schema.required : [];

  for (const key in schema.properties) {
      const prop = schema.properties[key];
      const fullPath = prefix ? `${prefix}.${key}` : key;
      const isRequired = requiredKeys.includes(key);
      
      if (prop.type === 'string') {
          fields.push({
              path: fullPath,
              title: prop.title || key,
              description: prop.description,
              help: (prop as any).help, // simple cast
              enumOptions: prop.enum,
              type: 'string',
              required: isRequired,
              minLength: prop.minLength
          });
      } else if (prop.type === 'boolean') {
          fields.push({
              path: fullPath,
              title: prop.title || key,
              description: prop.description,
              help: (prop as any).help,
              type: 'boolean',
              required: isRequired
          });
      } else if (prop.type === 'object' && prop.properties) {
          fields.push(...extractStringFields(prop, fullPath));
      }
  }
  return fields;
};

// Simple object path getter
const getValueByPath = (obj: any, path: string) => {
    if (!obj) return '';
    const val = path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined) ? acc[part] : undefined, obj);
    return val !== undefined ? val : '';
};

const hasOwnPath = (obj: any, path: string) => {
    if (!obj) return false;
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
        if (!current || !Object.prototype.hasOwnProperty.call(current, part)) return false;
        current = current[part];
    }
    return true;
};

// Immutably set value by path
const setValueByPath = (obj: any, path: string, value: any) => {
    const keys = path.split('.');
    const newObj = { ...obj };
    let current = newObj;
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (i === keys.length - 1) {
            current[key] = value;
        } else {
            // Create nested object if missing or copy existing
            current[key] = current[key] ? { ...current[key] } : {};
            current = current[key];
        }
    }
    return newObj;
};

const deepMerge = (base: any, override: any): any => {
    if (Array.isArray(override)) return override;
    if (override && typeof override === 'object' && !Array.isArray(override)) {
        const baseObj = (base && typeof base === 'object' && !Array.isArray(base)) ? base : {};
        const result: any = { ...baseObj };
        Object.keys(override).forEach(key => {
            const next = override[key];
            if (next === undefined) return;
            result[key] = deepMerge(baseObj[key], next);
        });
        return result;
    }
    return override !== undefined ? override : base;
};

const applyTemplateDefaultsForFields = (data: any, defaults: any, fields: string[]) => {
    let result = { ...(data || {}) } as any;
    fields.forEach(path => {
        if (!hasOwnPath(result, path)) {
            const defVal = getValueByPath(defaults, path);
            if (defVal !== undefined) {
                result = setValueByPath(result, path, defVal);
            }
        }
    });
    return result;
};

// Helper: Sanitize Data for Schema (Remove empty enums/optionals)
const sanitizeNodeDataForSchema = (fields: FieldDef[], data: any) => {
    let newData = { ...data };
    fields.forEach(f => {
         let val = getValueByPath(newData, f.path);
         
         // Empty string is preserved unless invalid per schema to avoid losing intentional values.
         if (typeof val === 'string' && val === '') {
             if (f.enumOptions && f.enumOptions.length > 0) {
                 if (!f.enumOptions.includes('')) {
                     newData = setValueByPath(newData, f.path, undefined);
                 }
             } else if (f.minLength !== undefined && f.minLength >= 1) {
                 newData = setValueByPath(newData, f.path, undefined);
             }
             // Otherwise KEEP "" (valid empty string)
         } else if (val === null) {
             newData = setValueByPath(newData, f.path, undefined);
         }
    });
    return newData;
};

// --- Minimal UI Components ---

interface ModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmLabel?: string;
    cancelLabel?: string;
}

const ConfirmModal = ({ isOpen, title, message, onConfirm, onCancel, confirmLabel = 'Confirm', cancelLabel = 'Cancel' }: ModalProps) => {
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onCancel();
            if (e.key === 'Enter') onConfirm();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, onCancel, onConfirm]);

    if (!isOpen) return null;
    return (
        <div className="confirm-modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            <div className="confirm-modal-content" style={{
                background: 'white', padding: '20px', borderRadius: '4px',
                width: '400px', maxWidth: '90%', boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                display: 'flex', flexDirection: 'column', gap: '15px'
            }}>
                <h3 style={{ margin: 0, fontSize: '1.2em' }}>{title}</h3>
                <div style={{ whiteSpace: 'pre-wrap', color: '#333', fontSize: '0.95em' }}>{message}</div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button onClick={onCancel} style={{
                        padding: '6px 14px', background: 'white', border: '1px solid #bbb', color: '#111', 
                        borderRadius: '4px', cursor: 'pointer', fontSize: '0.9em', fontWeight: 'bold'
                    }}>{cancelLabel}</button>
                    <button onClick={onConfirm} style={{
                        padding: '6px 14px', background: '#e65100', color: 'white', border: '1px solid #e65100', 
                        borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9em'
                    }}>{confirmLabel}</button>
                </div>
            </div>
        </div>
    );
};

interface ToastProps {
    message: string;
    onClose: () => void;
    type?: 'success' | 'error' | 'info';
}

const ToastNotification = ({ message, onClose, type = 'info' }: ToastProps) => {
    useEffect(() => {
        // Longer duration for specific types
        const duration = type === 'error' ? 8000 : (type === 'success' ? 4500 : 3000);
        const timer = setTimeout(onClose, duration);
        return () => clearTimeout(timer);
    }, [onClose, type]);

    const bg = type === 'success' ? '#2e7d32' : (type === 'error' ? '#c62828' : '#333');
    
    return (
        <div className={`toast-notification toast-${type}`} style={{
            position: 'fixed', bottom: '20px', right: '20px', zIndex: 10001,
            background: bg, color: 'white', padding: '10px 15px', borderRadius: '4px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: '10px',
            fontSize: '0.9em', animation: 'fadeIn 0.2s ease-out'
        }}>
            <span>{message}</span>
            <button onClick={onClose} style={{
                background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.2em', lineHeight: 1
            }}>×</button>
        </div>
    );
};

function SysadminPanel({ 
    isOpen, 
    onClose, 
    bundleData, 
    runtimePlan, 
    runningSource = 'ACTIVE',
    lastConfigEvent,
    onApplyDraft,
    onRollback,
    canRollback,
    onRefresh,
    safeModeEnabled,
    windowEvents,
    onClearWindowEvents,
    onResetWindowLayout,
    onCloseAllWindows,
    onOpenWindow,
    onFocusWindow,
    onCloseWindow
}: { 
    isOpen: boolean; 
    onClose: () => void; 
    bundleData: BundleResponse | null; 
    runtimePlan: RuntimePlan | null; 
    runningSource?: 'ACTIVE' | 'DRAFT';
    lastConfigEvent?: { kind: 'APPLY' | 'ROLLBACK'; ts: number } | null;
    onApplyDraft: (draft: BundleResponse) => void;
    onRollback: () => void;
    canRollback: boolean;
    onRefresh: () => void;
    safeModeEnabled: boolean;
    windowEvents: WindowEvent[];
    onClearWindowEvents: () => void;
    onResetWindowLayout: () => void;
    onCloseAllWindows: () => void;
    onOpenWindow: (windowId: string) => void;
    onFocusWindow: (windowId: string) => void;
    onCloseWindow: (windowId: string) => void;
}) {
    const caps = useCapabilities();

    const debugFetch = async (inputPath: string, init?: RequestInit): Promise<Response | null> => {
        if (!caps.debugEndpointsEnabled) return null;

        // temporary dev bridge; final system uses real auth permissions.
        const devAuth = localStorage.getItem('FOLE_DEV_AUTH');
        if (!devAuth) return null;

        try {
             const headers = new Headers(init?.headers || {});
             headers.set('X-Dev-Auth', devAuth);

             return await fetch(apiUrl(inputPath), {
                 ...init,
                 headers
             });
        } catch (e) {
             console.warn("Debug fetch blocked/failed", e);
             return null;
        }
    };

    const governedFetch = async (inputPath: string, init?: RequestInit): Promise<Response | null> => {
        const devAuth = localStorage.getItem('FOLE_DEV_AUTH');
        try {
            const headers = new Headers(init?.headers || {});
            if (devAuth) headers.set('X-Dev-Auth', devAuth);

            return await fetch(apiUrl(inputPath), {
                ...init,
                headers
            });
        } catch (e) {
            console.warn("Governed fetch failed", e);
            return null;
        }
    };

    // Block Schema Cache (non-ui-node)
    const [blockSchemas, setBlockSchemas] = useState<Record<string, any>>({});
    const [blockSchemaErrors, setBlockSchemaErrors] = useState<Record<string, string | null>>({});

    const fetchBlockSchema = async (blockType: string): Promise<any | null> => {
        if (!blockType) return null;
        if (blockSchemas[blockType]) return blockSchemas[blockType];

        const res = await governedFetch(`/api/schemas/block/${encodeURIComponent(blockType)}`);
        if (!res) {
            setBlockSchemaErrors(prev => ({ ...prev, [blockType]: 'Schema fetch failed (no response)' }));
            return null;
        }

        if (!res.ok) {
            const msg = `Schema fetch failed (${res.status})`;
            setBlockSchemaErrors(prev => ({ ...prev, [blockType]: msg }));
            return null;
        }

        try {
            const json = await res.json();
            const schema = json?.data?.schema ?? json?.schema ?? null;
            if (schema) {
                setBlockSchemas(prev => ({ ...prev, [blockType]: schema }));
                setBlockSchemaErrors(prev => ({ ...prev, [blockType]: null }));
                return schema;
            }
            setBlockSchemaErrors(prev => ({ ...prev, [blockType]: 'Schema missing in response' }));
            return null;
        } catch (e: any) {
            setBlockSchemaErrors(prev => ({ ...prev, [blockType]: e?.message || 'Schema parse failed' }));
            return null;
        }
    };

    const validateWithSchemaMinimal = (schema: any, value: unknown) => {
        const errors: string[] = [];
        if (!schema) return { valid: true, errors };

        const expectType = (t: any, v: any, label: string) => {
            if (!t) return;
            const types = Array.isArray(t) ? t : [t];
            const ok = types.some((type: string) => {
                if (type === 'array') return Array.isArray(v);
                if (type === 'object') return v !== null && typeof v === 'object' && !Array.isArray(v);
                return typeof v === type;
            });
            if (!ok) errors.push(`${label} must be ${types.join(' or ')}`);
        };

        expectType(schema.type, value, 'Value');

        if (schema.type === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
            const obj = value as Record<string, any>;
            if (Array.isArray(schema.required)) {
                schema.required.forEach((key: string) => {
                    if (obj[key] === undefined) errors.push(`Missing required field: ${key}`);
                });
            }

            if (schema.properties && typeof schema.properties === 'object') {
                Object.entries(schema.properties).forEach(([key, def]: any) => {
                    if (obj[key] === undefined) return;
                    expectType(def?.type, obj[key], key);
                });
            }

            const tokensSchema = schema?.properties?.tokens;
            if (tokensSchema?.patternProperties && obj.tokens && typeof obj.tokens === 'object') {
                const tokenDef = Object.values(tokensSchema.patternProperties)[0] as any;
                if (tokenDef?.type) {
                    Object.entries(obj.tokens).forEach(([k, v]) => {
                        expectType(tokenDef.type, v, `tokens.${k}`);
                    });
                }
            }

        }

        return { valid: errors.length === 0, errors };
    };

    // Roadmap #6.1: Config-Driven Sysadmin Loader Hook (Placeholder)
    // In future steps, this will drive the UI instead of the hardcoded tabs below.
    // const sysadminBlock = bundleData?.blocks ? findSysadminBlock(bundleData.blocks) : null;
    // const sysadminConfig = sysadminBlock ? parseSysadminConfig(sysadminBlock) : null;
    // useEffect(() => {
    //    if (sysadminConfig) { 
    //        console.log('[Sysadmin] Configuration loaded:', sysadminConfig); 
    //        // TODO: Switch to ConfigDrivenSysadminPanel here
    //    }
    // }, [sysadminConfig]);

    // Tabs: ShellConfig, Blocks, Bindings, ActionIndex, Runtime
    const [activeTab, setActiveTab] = useState('ShellConfig');

    // UX State (Modal + Toast)
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
    }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

    const [toast, setToast] = useState<{
        message: string;
        type: 'success' | 'error' | 'info';
    } | null>(null);

    // Roadmap 6.3: Auto-select ConfigSysadmin if available
    // Runs only when opening the panel to switch default tab
    const prevIsOpenRef = useRef(isOpen);
    useEffect(() => {
        const wasOpen = prevIsOpenRef.current;
        if (!wasOpen && isOpen) {
            // Panel just opened
            if (activeTab === 'ShellConfig' && bundleData?.blocks) {
                if (findSysadminBlock(bundleData.blocks)) {
                    setActiveTab('ConfigSysadmin');
                }
            }
        }
        prevIsOpenRef.current = isOpen;
    }, [isOpen, activeTab, bundleData]);

    const [filter, setFilter] = useState('');
    const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
    const [selectedBindingId, setSelectedBindingId] = useState<string | null>(null);
    const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    // Hoisted Save State for ConfigSysadminView (Roadmap 7.2 UX)
    // We hoist this so the success banner persists across re-renders/tab switches if needed.
    const [pendingStage, setPendingStage] = useState<'idle' | 'saving' | 'awaiting_ack' | 'activating' | 'success' | 'error' | 'preflight_error'>('idle');
    const [saveMessage, setSaveMessage] = useState('');
    const [pendingPreflight, setPendingPreflight] = useState<any>(null);
    const [pendingAck, setPendingAck] = useState(false);
    const [pendingCandidateVersionId, setPendingCandidateVersionId] = useState<string | null>(null);
    
    const saveDismissTimerRef = useRef<number | null>(null);

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
             if (saveDismissTimerRef.current) clearTimeout(saveDismissTimerRef.current);
        };
    }, []);

    const ENABLE_LEGACY_SYSADMIN_TABS = true;

    // Dynamic Tabs Definition
    const tabs = ['ShellConfig', 'Blocks', 'Bindings', 'Data', 'Theme', 'ActionIndex', 'Runtime', 'UI Runtime', 'Draft', 'Invocations', 'Traces', 'Activations'];
    if (ENABLE_LEGACY_SYSADMIN_TABS) {
        tabs.push('Snapshot');
        tabs.push('Versions');
    }
    tabs.push('Resolved Graph');
    tabs.push('ConfigSysadmin');
    tabs.push('Node Editor (Button)');
    tabs.push('Node Editor (Text)');
    tabs.push('Node Editor (Container)'); // Added for Node Editor (Container)
    tabs.push('Node Editor (Window)');

    // const [activeTab, setActiveTab] = useState('ShellConfig'); // Defined at top of component
    const [invocations, setInvocations] = useState<RuntimeInvocation[] | null>(null);
    const [invocationsError, setInvocationsError] = useState<string | null>(null);
    const [expandedInvocationKey, setExpandedInvocationKey] = useState<string | null>(null);

    const [activationEvents, setActivationEvents] = useState<ActivationEvent[] | null>(null);
    const [activationEventsError, setActivationEventsError] = useState<string | null>(null);
    const [activationEventsLoading, setActivationEventsLoading] = useState(false);

    // Execute Mode (Phase 4.3.2)
    const [executeMode, setExecuteMode] = useState<boolean | null>(null);
    const [executeModeError, setExecuteModeError] = useState<string | null>(null);
    void executeModeError;

    // Snapshot (Epic 4 Step 2)
    const [snapshotData, setSnapshotData] = useState<SnapshotResponse | null>(null);
    const [snapshotError, setSnapshotError] = useState<string | null>(null);
    const [snapshotLoading, setSnapshotLoading] = useState(false);

    // Resolved Graph Inspector
    const [resolvedGraph, setResolvedGraph] = useState<any | null>(null);
    const [resolvedGraphError, setResolvedGraphError] = useState<string | null>(null);
    const [resolvedGraphLoading, setResolvedGraphLoading] = useState(false);

    // Node Editor State
    const [nodeEditorSelectedId, setNodeEditorSelectedId] = useState<string | null>(null);
    const [nodeEditorForm, setNodeEditorForm] = useState<any>({});
    const [nodeEditorDirty, setNodeEditorDirty] = useState(false);
    const [nodeTemplateId, setNodeTemplateId] = useState<string | null>(null);
    const [nodeOverrideFlags, setNodeOverrideFlags] = useState<Record<string, boolean>>({});

    const buttonOverrideFields = ['label', 'variant', 'icon', 'helpText', 'requiredPermission'];

    // Schema State
    const [buttonSchema, setButtonSchema] = useState<any>(null);
    const [buttonSchemaLoading, setButtonSchemaLoading] = useState(false);

    // Text Node Schema State
    const [textSchema, setTextSchema] = useState<any>(null);
    const [textSchemaLoading, setTextSchemaLoading] = useState(false);

    // Container Node Schema State
    const [containerSchema, setContainerSchema] = useState<any>(null);
    const [containerSchemaLoading, setContainerSchemaLoading] = useState(false);

    // Window Node Schema State
    const [windowSchema, setWindowSchema] = useState<any>(null);
    const [windowSchemaLoading, setWindowSchemaLoading] = useState(false);

    useEffect(() => {
        if (activeTab === 'Node Editor (Button)' && !buttonSchema && !buttonSchemaLoading) {
            setButtonSchemaLoading(true);
            fetch(apiUrl('/api/schemas/ui-node/ui.node.button'))
                .then(r => r.json())
                .then(d => {
                     setButtonSchema(d);
                     setButtonSchemaLoading(false);
                })
                .catch(e => {
                     // eslint-disable-next-line no-console
                     console.error("Schema load failed", e);
                     setButtonSchemaLoading(false);
                });
        }
        if (activeTab === 'Node Editor (Text)' && !textSchema && !textSchemaLoading) {
            setTextSchemaLoading(true);
            fetch(apiUrl('/api/schemas/ui-node/ui.node.text'))
                .then(r => r.json())
                .then(d => {
                     setTextSchema(d);
                     setTextSchemaLoading(false);
                })
                .catch(e => {
                     // eslint-disable-next-line no-console
                     console.error("Text schema load failed", e);
                     setTextSchemaLoading(false);
                });
        }
        if (activeTab === 'Node Editor (Container)' && !containerSchema && !containerSchemaLoading) {
            setContainerSchemaLoading(true);
            fetch(apiUrl('/api/schemas/ui-node/ui.node.container'))
                .then(r => r.json())
                .then(d => {
                     setContainerSchema(d);
                     setContainerSchemaLoading(false);
                })
                .catch(e => {
                     // eslint-disable-next-line no-console
                     console.error("Container schema load failed", e);
                     setContainerSchemaLoading(false);
                });
        }
        if (activeTab === 'Node Editor (Window)' && !windowSchema && !windowSchemaLoading) {
            setWindowSchemaLoading(true);
            fetch(apiUrl('/api/schemas/ui-node/ui.node.window'))
                .then(r => r.json())
                .then(d => {
                     setWindowSchema(d);
                     setWindowSchemaLoading(false);
                })
                .catch(e => {
                     // eslint-disable-next-line no-console
                     console.error("Window schema load failed", e);
                     setWindowSchemaLoading(false);
                });
        }
    }, [activeTab, buttonSchema, buttonSchemaLoading, textSchema, textSchemaLoading, containerSchema, containerSchemaLoading, windowSchema, windowSchemaLoading]);

    useEffect(() => {
        if (activeTab === 'Data') {
            void fetchBlockSchema('data.static');
        }
        if (activeTab === 'Bindings') {
            void fetchBlockSchema('binding');
        }
        if (activeTab === 'Theme') {
            void fetchBlockSchema('shell.infra.theme_tokens');
        }
    }, [activeTab]);

    // --- Node Editor Hooks & Helpers (Unconditional) ---
    const schemaFields = useMemo(() => {
        if (activeTab === 'Node Editor (Text)') {
            return extractStringFields(textSchema);
        }
        if (activeTab === 'Node Editor (Container)') {
            return extractStringFields(containerSchema);
        }
        if (activeTab === 'Node Editor (Window)') {
            return extractStringFields(windowSchema);
        }
        return extractStringFields(buttonSchema);
    }, [activeTab, buttonSchema, textSchema, containerSchema, windowSchema]);


    const getEffectiveNode = (id: string) => {
         // Use draftBundle state for Draft source
         const draftBlocks = (draftBundle as any)?.blocks || {};
         const draftBlock = findBlockById(draftBlocks, id);
         if (draftBlock) {
            const activeBlocks = (bundleData as any)?.blocks || {};
            const activeBlock = findBlockById(activeBlocks, id);
            const baseData = (activeBlock?.data && typeof activeBlock.data === 'object') ? activeBlock.data : {};
            const draftOverrides = (draftBlock?.data && typeof draftBlock.data === 'object') ? draftBlock.data : {};
            const composedData = deepMerge(baseData, draftOverrides);
            const nodeType = draftBlock?.blockType || activeBlock?.blockType || resolvedGraph?.nodesById?.[id]?.type;

            let effectiveData = composedData;
            if (nodeType === 'ui.node.button') {
                const inheritFrom = (draftOverrides as any)?.inheritFrom ?? (baseData as any)?.inheritFrom;
                if (typeof inheritFrom === 'string' && bundleData?.blocks) {
                    const tpl = (bundleData as any).blocks[inheritFrom];
                    const tplDefaults = tpl?.blockType === 'template' && tpl?.data?.targetBlockType === 'ui.node.button'
                        ? tpl.data?.defaults || {}
                        : null;
                    if (tplDefaults && typeof tplDefaults === 'object') {
                        effectiveData = applyTemplateDefaultsForFields(composedData, tplDefaults, buttonOverrideFields);
                    }
                }
            }

            return { id: draftBlock.blockId, type: nodeType, ...effectiveData, _source: 'DRAFT' };
         }
         const activeBlocks = (bundleData as any)?.blocks || {};
         const activeBlock = findBlockById(activeBlocks, id);
         if (activeBlock?.data && typeof activeBlock.data === 'object') {
             return {
                 id: activeBlock.blockId || activeBlock.id || id,
                 type: activeBlock.blockType || 'ui.node.button',
                 ...(activeBlock.data as any),
                 _source: 'ACTIVE'
             };
         }
         // Updated to use nodesById and props
         const nodes = resolvedGraph?.nodesById || {};
         const activeNode = nodes[id];
         return activeNode ? { id: activeNode.id, type: activeNode.type, ...activeNode.props, _source: 'ACTIVE' } : null;
    };

    const handleNodeSelect = (id: string) => {
         setNodeEditorSelectedId(id);
         const n = getEffectiveNode(id);
         if (n) {
            const newForm: any = {};
            schemaFields.forEach(f => {
                const val = getValueByPath(n, f.path);
                if (f.type === 'boolean') {
                     // Ensure boolean fields default to false instead of empty string
                     newForm[f.path] = (val === '' || val === undefined) ? false : val;
                } else {
                     newForm[f.path] = val;
                }
            });
            setNodeEditorForm(newForm);
            setNodeEditorDirty(false);
         }
    };

    const buildNodeEditorDraftBlock = () => {
         if (!nodeEditorSelectedId) return null;

         const draftBlocks = (draftBundle as any)?.blocks || {};
         const existingDraftBlock = draftBlocks[nodeEditorSelectedId];
         const nodes = resolvedGraph?.nodesById || {};
         const activeNode = nodes[nodeEditorSelectedId];

         const baseData = existingDraftBlock ? existingDraftBlock.data : (activeNode ? activeNode.props : {});
         let newData = { ...baseData };
         schemaFields.forEach(f => {
             newData = setValueByPath(newData, f.path, nodeEditorForm[f.path]);
         });

         newData = sanitizeNodeDataForSchema(schemaFields, newData);

         if (activeTab === 'Node Editor (Button)') {
             let overrideData: any = {};
             if (nodeTemplateId) {
                 overrideData = { ...overrideData, inheritFrom: nodeTemplateId };
             }
             buttonOverrideFields.forEach(path => {
                 if (nodeOverrideFlags[path]) {
                     overrideData = setValueByPath(overrideData, path, nodeEditorForm[path]);
                 }
             });
             newData = sanitizeNodeDataForSchema(schemaFields, overrideData);
             if (getValueByPath(newData, 'behaviors.onClick.actionId') === '') {
                 newData = setValueByPath(newData, 'behaviors.onClick.actionId', undefined);
             }
         }

         let defaultType = 'ui.node.button';
         if (activeTab === 'Node Editor (Text)') defaultType = 'ui.node.text';
         if (activeTab === 'Node Editor (Container)') defaultType = 'ui.node.container';
         if (activeTab === 'Node Editor (Window)') defaultType = 'ui.node.window';

         const finalType = activeNode?.type || existingDraftBlock?.blockType || defaultType;

         return {
             blockId: nodeEditorSelectedId,
             blockType: finalType,
             schemaVersion: '1.0.0',
             filename: existingDraftBlock?.filename || `${nodeEditorSelectedId}.json`,
             data: newData
         };
    };

    const applyNodeEditorDraftBlock = (block: any) => {
         let newDraft: any;
         if (draftBundle) {
             newDraft = { ...(draftBundle as any) };
         } else if (bundleData) {
             try {
                newDraft = JSON.parse(JSON.stringify(bundleData));
             } catch {
                return;
             }
         } else {
             return;
         }

         if (!newDraft.blocks) newDraft.blocks = {};
         newDraft.blocks[block.blockId] = block;

         setDraftBundle(newDraft);
         setNodeEditorDirty(false);
         setTimeout(() => handleNodeSelect(block.blockId), 0);
    };

    const handleSaveNodeDraftVersion = async () => {
         const block = buildNodeEditorDraftBlock();
         if (!block) return;

         applyNodeEditorDraftBlock(block);
         setNodeDraftSaving(true);

         try {
             const res = await governedFetch(`/api/v1/config/blocks/${encodeURIComponent(block.blockId)}/patch`, {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({
                     patch: { data: block.data },
                     message: 'Node editor draft save'
                 })
             });

             if (!res) {
                 const msg = 'Save failed (no response)';
                 showBanner({ kind: 'error', message: `Save failed: ${msg}`, ts: Date.now() });
                 return;
             }

             if (!res.ok) {
                 const txt = await res.text().catch(() => '');
                 const msg = `Save failed (${res.status})${txt ? `: ${txt}` : ''}`;
                 showBanner({ kind: 'error', message: `Save failed: ${msg}`, ts: Date.now() });
                 return;
             }

             const json = await res.json();
             if (json?.ok === false) {
                 const msg = json?.error?.message || 'Save failed';
                 showBanner({ kind: 'error', message: `Save failed: ${msg}`, ts: Date.now() });
                 return;
             }

             const payload = json?.data ?? json?.result ?? null;
             const newVersionId = payload?.newVersionId;
             const statusMsg = newVersionId ? `Draft saved: ${newVersionId}` : 'Draft saved';
             showBanner({ kind: 'success', message: statusMsg, ts: Date.now() });
             setLastDraftVersionId(newVersionId || null);
         } catch (e: any) {
             const msg = e?.message || String(e);
             showBanner({ kind: 'error', message: `Save failed: ${msg}`, ts: Date.now() });
         } finally {
             setNodeDraftSaving(false);
         }
    };

    const isPatchableBlockType = (blockType: unknown) => {
         return typeof blockType === 'string' && (blockType === 'data.static' || blockType.startsWith('ui.node.'));
    };

    const getBlockId = (block: any): string | null => {
         const blockId = block?.blockId || block?.id;
         return typeof blockId === 'string' && blockId.trim() ? blockId : null;
    };

    const findBlockById = (blocks: any, id: string) => {
         if (!blocks || !id) return null;
         if (Array.isArray(blocks)) {
             return blocks.find((b: any) => (b?.blockId === id || b?.id === id || b?.data?.id === id)) || null;
         }
         if (typeof blocks === 'object') {
             const direct = (blocks as Record<string, any>)[id];
             if (direct) return direct;
             return Object.values(blocks as Record<string, any>).find((b: any) => (b?.blockId === id || b?.id === id || b?.data?.id === id)) || null;
         }
         return null;
    };

    const parseJsonSafely = (text: string) => {
         try {
             return { value: JSON.parse(text), error: null as string | null };
         } catch (e: any) {
             return { value: null, error: e?.message || 'Invalid JSON' };
         }
    };

    const handleSaveBlocksDraft = async () => {
         if (!bundleData || !selectedBlockId) return;
         const block = findBlockById((bundleData as any)?.blocks, selectedBlockId);
         const blockId = getBlockId(block);
         if (!block || !blockId) {
             showBanner({ kind: 'error', message: 'Save failed: missing block id', ts: Date.now() });
             return;
         }
         if (!isPatchableBlockType(block.blockType)) {
             showBanner({ kind: 'error', message: 'Save failed: block type is not patchable', ts: Date.now() });
             return;
         }

         const parsed = parseJsonSafely(blocksEditorText);
         if (parsed.error || parsed.value === null) {
             showBanner({ kind: 'error', message: `Save failed: ${parsed.error || 'Invalid JSON'}`, ts: Date.now() });
             return;
         }

         setBlocksDraftSaving(true);
         try {
             const res = await governedFetch(`/api/v1/config/blocks/${encodeURIComponent(blockId)}/patch`, {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({
                     patch: { data: parsed.value },
                     message: 'Blocks tab draft save'
                 })
             });

             if (!res) {
                 const msg = 'Save failed (no response)';
                 showBanner({ kind: 'error', message: `Save failed: ${msg}`, ts: Date.now() });
                 return;
             }

             if (!res.ok) {
                 const txt = await res.text().catch(() => '');
                 const msg = `Save failed (${res.status})${txt ? `: ${txt}` : ''}`;
                 showBanner({ kind: 'error', message: `Save failed: ${msg}`, ts: Date.now() });
                 return;
             }

             const json = await res.json();
             if (json?.ok === false) {
                 const msg = json?.error?.message || 'Save failed';
                 showBanner({ kind: 'error', message: `Save failed: ${msg}`, ts: Date.now() });
                 return;
             }

             const payload = json?.data ?? json?.result ?? null;
             const newVersionId = payload?.newVersionId;
             const statusMsg = newVersionId ? `Draft saved: ${newVersionId}` : 'Draft saved';
             showBanner({ kind: 'success', message: statusMsg, ts: Date.now() });
             setLastDraftVersionId(newVersionId || null);

             const nextBaseline = JSON.stringify(parsed.value, null, 2);
             setBlocksEditorBaseline(nextBaseline);
             setBlocksEditorText(nextBaseline);
             setBlocksEditorError(null);
             setBlocksEditorDirty(false);
         } catch (e: any) {
             const msg = e?.message || String(e);
             showBanner({ kind: 'error', message: `Save failed: ${msg}`, ts: Date.now() });
         } finally {
             setBlocksDraftSaving(false);
         }
    };

    const handleSaveBindingsDraft = async () => {
         if (!bundleData || !selectedBindingId) return;
         const block = findBlockById((bundleData as any)?.blocks, selectedBindingId);
         const blockId = getBlockId(block);
         if (!block || !blockId) {
             showBanner({ kind: 'error', message: 'Save failed: missing binding id', ts: Date.now() });
             return;
         }
         if (block.blockType !== 'binding') {
             showBanner({ kind: 'error', message: 'Save failed: selected block is not a binding', ts: Date.now() });
             return;
         }

         const parsed = parseJsonSafely(bindingsEditorText);
         if (parsed.error || parsed.value === null) {
             showBanner({ kind: 'error', message: `Save failed: ${parsed.error || 'Invalid JSON'}`, ts: Date.now() });
             return;
         }

         setBindingsDraftSaving(true);
         try {
             const res = await governedFetch(`/api/v1/config/blocks/${encodeURIComponent(blockId)}/patch`, {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({
                     patch: { data: parsed.value },
                     message: 'Bindings tab draft save'
                 })
             });

             if (!res) {
                 const msg = 'Save failed (no response)';
                 showBanner({ kind: 'error', message: `Save failed: ${msg}`, ts: Date.now() });
                 return;
             }

             if (!res.ok) {
                 const txt = await res.text().catch(() => '');
                 const msg = `Save failed (${res.status})${txt ? `: ${txt}` : ''}`;
                 showBanner({ kind: 'error', message: `Save failed: ${msg}`, ts: Date.now() });
                 return;
             }

             const json = await res.json();
             if (json?.ok === false) {
                 const msg = json?.error?.message || 'Save failed';
                 showBanner({ kind: 'error', message: `Save failed: ${msg}`, ts: Date.now() });
                 return;
             }

             const payload = json?.data ?? json?.result ?? null;
             const newVersionId = payload?.newVersionId;
             const statusMsg = newVersionId ? `Draft saved: ${newVersionId}` : 'Draft saved';
             showBanner({ kind: 'success', message: statusMsg, ts: Date.now() });
             setLastDraftVersionId(newVersionId || null);

             const nextBaseline = JSON.stringify(parsed.value, null, 2);
             setBindingsEditorBaseline(nextBaseline);
             setBindingsEditorText(nextBaseline);
             setBindingsEditorError(null);
             setBindingsEditorDirty(false);
         } catch (e: any) {
             const msg = e?.message || String(e);
             showBanner({ kind: 'error', message: `Save failed: ${msg}`, ts: Date.now() });
         } finally {
             setBindingsDraftSaving(false);
         }
    };


    const renderValidationSummary = () => {
         // --- DIFF PREVIEW ---
         let diffElement = null;
         const nodeForDiff = nodeEditorSelectedId ? getEffectiveNode(nodeEditorSelectedId) : null;
         if (nodeForDiff && resolvedGraph) {
             let targetSchema = null;
             if (nodeForDiff.type === 'ui.node.button') targetSchema = buttonSchema;
             else if (nodeForDiff.type === 'ui.node.text') targetSchema = textSchema;
             else if (nodeForDiff.type === 'ui.node.container') targetSchema = containerSchema;
             else if (nodeForDiff.type === 'ui.node.window') targetSchema = windowSchema;
             
             if (targetSchema) {
                 const fields = extractStringFields(targetSchema);
                 const activeNode = resolvedGraph.nodesById?.[nodeForDiff.id];
                 if (activeNode) {
                    const changes: { field: string, from: any, to: any }[] = [];
                    fields.forEach(f => {
                         let vActive = activeNode.props?.[f.path];
                         let vDraft = nodeEditorForm[f.path];
                         if (f.type === 'boolean') { vActive = !!vActive; vDraft = !!vDraft; }
                         else {
                             if (vActive === undefined || vActive === null) vActive = '';
                             if (vDraft === undefined || vDraft === null) vDraft = '';
                         }
                         if (vActive !== vDraft) changes.push({ field: f.title || f.path, from: vActive, to: vDraft });
                    });
                    if (changes.length > 0) {
                        diffElement = (
                            <div style={{width:'100%', fontSize:'0.75em', background:'#fff', border:'1px solid #ddd', borderRadius:'4px', padding:'6px', marginBottom:'4px', textAlign:'left', boxShadow:'0 1px 2px rgba(0,0,0,0.05)'}}>
                                <div style={{fontWeight:'bold', borderBottom:'1px solid #eee', paddingBottom:'2px', marginBottom:'2px', color:'#333'}}>Changes vs Active</div>
                                {changes.map((c, i) => (
                                    <div key={i} style={{marginBottom:'2px', fontFamily:'monospace', display:'flex', gap:'4px', alignItems:'center'}}>
                                        <span style={{fontWeight:'bold', color:'#555'}}>{c.field}:</span> 
                                        <span style={{color:'#d32f2f', textDecoration:'line-through', fontSize:'0.9em'}}>{typeof c.from === 'boolean' ? String(c.from) : (c.from||'""')}</span> 
                                        <span style={{color:'#999'}}>&rarr;</span> 
                                        <span style={{color:'#2e7d32', fontWeight:'bold'}}>{typeof c.to === 'boolean' ? String(c.to) : (c.to||'""')}</span>
                                    </div>
                                ))}
                            </div>
                        );
                    } else {
                        diffElement = <div style={{width:'100%', fontSize:'0.75em', fontStyle:'italic', color:'#aaa', textAlign:'right', marginBottom:'4px'}}>No differences vs Active</div>;
                    }
                 }
             }
         }

         const { errors, warnings } = validationResult;
         
         // 0. Prepare Block Lookup for "Go to" resolution
         const blocksMap = (bundleData as any)?.blocks || {};
         const allBlocks = Array.isArray(blocksMap) 
             ? blocksMap 
             : typeof blocksMap === 'object' 
                 ? Object.values(blocksMap) 
                 : [];

         const resolveBlockTarget = (rawId: string) => {
             // 1. Exact Match
             if (allBlocks.some((b:any) => (b.blockId === rawId || b.id === rawId))) return rawId;
             // 2. Dash vs Underscore Normalization
             const withUnder = rawId.replace(/-/g, '_');
             if (allBlocks.some((b:any) => (b.blockId === withUnder || b.id === withUnder))) return withUnder;
             const withDash = rawId.replace(/_/g, '-');
             if (allBlocks.some((b:any) => (b.blockId === withDash || b.id === withDash))) return withDash;
             // 3. No match
             return null;
         };

         // 1. This Node Issues
         const nodeErrors = errors.filter(e => nodeEditorSelectedId && e.includes(nodeEditorSelectedId));
         const nodeWarnings = warnings.filter(w => nodeEditorSelectedId && w.includes(nodeEditorSelectedId));
         const hasNodeIssues = nodeErrors.length > 0 || nodeWarnings.length > 0;

         // 2. Global Issues (Exclude current node issues to avoid duplication)
         const otherErrors = errors.filter(e => !nodeEditorSelectedId || !e.includes(nodeEditorSelectedId));
         const otherWarnings = warnings.filter(w => !nodeEditorSelectedId || !w.includes(nodeEditorSelectedId));
         const hasGlobalIssues = otherErrors.length > 0 || otherWarnings.length > 0;

         if (!hasNodeIssues && !hasGlobalIssues && !diffElement) return null;

         return (
             <div style={{display:'flex', flexDirection:'column', alignItems:'flex-end', marginBottom:'8px', gap:'6px', maxWidth:'300px'}}>
                 {diffElement}
                 
                 {/* Section 1: This Node */}
                 {hasNodeIssues ? (
                     <div style={{textAlign:'right', borderRight:'3px solid #d32f2f', paddingRight:'6px', backgroundColor:'#fff0f0', borderRadius:'2px', padding:'4px'}}>
                         <div style={{fontSize:'0.75em', fontWeight:'bold', color:'#d32f2f', marginBottom:'2px'}}>This Node</div>
                         {[...nodeErrors, ...nodeWarnings].map((msg, i) => (
                             <div key={'node'+i} style={{fontSize:'0.7em', color: nodeErrors.includes(msg)?'#d32f2f':'#ef6c00', marginBottom:'1px'}}>
                                 {msg}
                             </div>
                         ))}
                     </div>
                 ) : (
                     <div style={{textAlign:'right', borderRight:'3px solid #4caf50', paddingRight:'6px'}}>
                         <div style={{fontSize:'0.75em', fontWeight:'bold', color:'#4caf50'}}>This Node: VALID</div>
                     </div>
                 )}

                 {/* Section 2: Global (Draft) */}
                 {hasGlobalIssues && (
                     <div style={{textAlign:'right', borderRight:'3px solid #bbb', paddingRight:'6px', marginTop:'4px'}}>
                         <div style={{fontSize:'0.75em', fontWeight:'bold', color:'#555', marginBottom:'2px'}}>Draft (Global Issues)</div>
                         {[...otherErrors, ...otherWarnings].slice(0, 3).map((msg, i) => {
                             const isErr = otherErrors.includes(msg);
                             // Attempt to extract block id from quotes, e.g. Block "foo" ...
                             const extractId = msg.match(/"([^"]+)"/)?.[1];
                             
                             // Resolve Target
                             const targetId = extractId ? resolveBlockTarget(extractId) : null;
                             
                             return (
                                 <div key={'global'+i} style={{marginBottom:'3px'}}>
                                     <div style={{fontSize:'0.7em', color: isErr?'#d32f2f':'#f57c00'}}>
                                         {msg}
                                     </div>
                                     {extractId && (
                                         <div 
                                             style={{fontSize:'0.65em', color: targetId ? '#007acc' : '#999', cursor:'pointer', textDecoration:'underline'}}
                                             onClick={() => {
                                                 const finalId = targetId || extractId;
                                                 setFilter(finalId);
                                                 if (targetId) setSelectedBlockId(targetId);
                                                 setActiveTab('Blocks');
                                             }}
                                             title={targetId ? `Go to ${targetId}` : 'Block not found in active/draft set'}
                                         >
                                             Go to {extractId} &rarr;
                                             {!targetId && <span style={{color:'#d32f2f', marginLeft:'4px', textDecoration:'none', fontWeight:'bold'}}>(Not found)</span>}
                                         </div>
                                     )}
                                 </div>
                             );
                         })}
                         {(otherErrors.length + otherWarnings.length) > 3 && (
                             <div style={{fontSize:'0.65em', color:'#888', fontStyle:'italic'}}>
                                 ...and {(otherErrors.length + otherWarnings.length) - 3} more
                             </div>
                         )}
                     </div>
                 )}

             </div>
         );
    };

    const refreshResolvedGraph = () => {
        setResolvedGraphLoading(true);
        setResolvedGraphError(null);
        fetch(apiUrl('/api/config/shell/resolved-graph/active'))
            .then(res => {
                 if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
                 return res.json();
            })
            .then(json => {
                setResolvedGraph(json);
                setResolvedGraphLoading(false);
            })
            .catch(err => {
                setResolvedGraphError(err.message);
                setResolvedGraphLoading(false);
            });
    };

    // Traces (Phase 4.3)
    const [dispatchTraces, setDispatchTraces] = useState<DispatchTrace[] | null>(null);
    const [dispatchTracesError, setDispatchTracesError] = useState<string | null>(null);
    const [expandedTraceKey, setExpandedTraceKey] = useState<string | null>(null);

    // Draft / Apply UX Hardening (EPIC 2)
    const [ackWarnings, setAckWarnings] = useState(false);
    const [confirmApply, setConfirmApply] = useState(false);



    const refreshSnapshot = async () => {
        setSnapshotLoading(true);
        setSnapshotError(null);

        const res = await governedFetch('/api/v1/runtime/snapshot');
        if (!res) {
            setSnapshotError('Fetch failed (no response)');
            setSnapshotLoading(false);
            return null;
        }
        if (!res.ok) {
            setSnapshotError(`Fetch failed (${res.status})`);
            setSnapshotLoading(false);
            return null;
        }

        try {
            const json = await res.json();
            if (json && json.ok === false) {
                setSnapshotError(json?.error?.message || 'Snapshot unavailable');
                setSnapshotLoading(false);
                return null;
            }

            const payload = json?.data ?? json?.result ?? json?.body ?? null;
            if (json && json.ok && payload) {
                setSnapshotData(payload || null);
                setSnapshotLoading(false);
                return payload;
            }

            if (payload) {
                setSnapshotData(payload || null);
                setSnapshotLoading(false);
                return payload;
            }

            setSnapshotError(json?.error?.message || 'Snapshot unavailable');
            setSnapshotLoading(false);
            return null;
        } catch (e: any) {
            setSnapshotError(e.message || String(e));
            setSnapshotLoading(false);
            return null;
        }
    };

    const refreshTraces = async () => {
        setDispatchTracesError(null);

        const res = await governedFetch('/api/v1/runtime/traces/recent?limit=20');
        if (!res) {
            setDispatchTracesError('Fetch failed (no response)');
            setDispatchTraces([]);
            return;
        }
        if (!res.ok) {
            setDispatchTracesError(`Fetch failed (${res.status})`);
            setDispatchTraces([]);
            return;
        }

        try {
            const j = await res.json();
            const list = Array.isArray(j?.data?.items) ? (j.data.items as DispatchTrace[]) : [];
            setDispatchTraces(list);
        } catch (e: any) {
            setDispatchTracesError(e.message || String(e));
            setDispatchTraces([]);
        }
    };

    const refreshActivations = async (nextFilter?: ActivationFilter) => {
        setActivationEventsError(null);
        setActivationEventsLoading(true);

        const filter = nextFilter || activationFilter;
        const outcomeParam = filter === 'all' ? '' : `&outcome=${filter}`;
        const res = await governedFetch(`/api/v1/admin/activations?limit=50${outcomeParam}`);
        if (!res) {
            setActivationEventsError('Fetch failed (no response)');
            setActivationEvents([]);
            setActivationEventsLoading(false);
            return;
        }
        if (res.status === 403) {
            setActivationEventsError('Access denied (admin only).');
            setActivationEvents([]);
            setActivationEventsLoading(false);
            return;
        }
        if (!res.ok) {
            setActivationEventsError(`Fetch failed (${res.status})`);
            setActivationEvents([]);
            setActivationEventsLoading(false);
            return;
        }

        try {
            const j = await res.json();
            const list = Array.isArray(j?.data?.items) ? (j.data.items as ActivationEvent[]) : [];
            setActivationEvents(list);
        } catch (e: any) {
            setActivationEventsError(e.message || String(e));
            setActivationEvents([]);
        } finally {
            setActivationEventsLoading(false);
        }
    };

    const refreshExecuteMode = async () => {
        setExecuteModeError(null);
        
        const res = await debugFetch('/api/debug/runtime/integrations/execute-mode');
        if (!res) {
             setExecuteMode(null);
             return;
        }

        if (!res.ok) return;

        try {
             const j = await res.json();
             setExecuteMode(!!j.enabled);
        } catch (e) {
             setExecuteMode(null);
             setExecuteModeError(String(e));
        }
    };

    const toggleExecuteMode = async () => {
        setExecuteModeError(null);
        const newState = !executeMode;
        
        const res = await debugFetch('/api/debug/runtime/integrations/execute-mode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: newState })
        });

        if (!res) return;

        try {
            const j = await res.json();
            
            if (!res.ok) {
                 setExecuteModeError(j.error || "Toggle failed");
                 return;
            }
            setExecuteMode(!!j.enabled);
            
            // Refresh list to show potential changes if any side-effects occurred
            refreshInvocations();
        } catch(err: any) {
            setExecuteModeError(err.message);
        }
    };
    void refreshExecuteMode;
    void toggleExecuteMode;

    const refreshInvocations = async () => {
        setInvocationsError(null);

        const res = await governedFetch('/api/v1/runtime/invocations/recent?limit=20');
        if (!res) {
            setInvocationsError('Fetch failed (no response)');
            setInvocations([]);
            return;
        }
        if (!res.ok) {
            setInvocationsError(`Fetch failed (${res.status})`);
            setInvocations([]);
            return;
        }

        try {
            const j = await res.json();
            setInvocations(Array.isArray(j?.data?.items) ? j.data.items : []);
        } catch (e: any) {
            setInvocationsError(e.message || String(e));
            setInvocations([]);
        }
    };

    // Versions (Roadmap #4 Step 2)
    const [shellVersions, setShellVersions] = useState<{
        activeVersionId: string;
        activeMeta: any;
        versions: any[];
    } | null>(null);
    const [shellVersionsError, setShellVersionsError] = useState<string | null>(null);
    const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
    const [selectedVersionDetail, setSelectedVersionDetail] = useState<any>(null);
    const [versionDetailError, setVersionDetailError] = useState<string | null>(null);
    const [versionDetailLoading, setVersionDetailLoading] = useState(false);
    const [activationMessage, setActivationMessage] = useState<string | null>(null);
    const [confirmActivate, setConfirmActivate] = useState(false);
    const [activateReason, setActivateReason] = useState('Activated from Sysadmin');

    // Preflight (Roadmap #4.2 Step 2)
    const [preflightLoading, setPreflightLoading] = useState(false);
    const [preflightResult, setPreflightResult] = useState<any>(null);
    const [preflightError, setPreflightError] = useState<string | null>(null);
    const [ackPreflightWarnings, setAckPreflightWarnings] = useState(false);

    // Adapter Capabilities (Roadmap #5.3.2)
    const [adapterCaps, setAdapterCaps] = useState<Record<string, any>>({});
    const [adapterCapsLoading, setAdapterCapsLoading] = useState(false);
    const [adapterCapsError, setAdapterCapsError] = useState<string | null>(null);

    // Change Summary (Roadmap #4.4)
    const [versionDiff, setVersionDiff] = useState<any>(null);
    const [versionDiffLoading, setVersionDiffLoading] = useState(false);
    const [versionDiffError, setVersionDiffError] = useState<string | null>(null);

    const fetchAdapterCaps = async () => {
        setAdapterCapsLoading(true);
        setAdapterCapsError(null);
        
        const res = await debugFetch('/api/debug/runtime/integrations/adapter-capabilities');
        if (!res) {
             setAdapterCaps({});
             setAdapterCapsLoading(false);
             return;
        }

        if (!res.ok) {
            setAdapterCapsLoading(false);
            return;
        }

        try {
            const data = await res.json();
            if (!data) return;
            // Shape: { adapters: [{ integrationType, capabilities: {...} }] }
            const map: Record<string, any> = {};
            if (Array.isArray(data.adapters)) {
                data.adapters.forEach((a: any) => {
                    map[a.integrationType] = a.capabilities;
                });
            }
            setAdapterCaps(map);
        } catch (e) {
            setAdapterCapsError(String(e));
        } finally {
            setAdapterCapsLoading(false);
        }
    };

    const fetchPreflight = async (vid: string) => {
        // Preflight is now standard - NO debug check needed, 
        // BUT wait this is "fetchPreflight" inside SysadminPanel which might be using debug?
        // Let's check the URL. Previous code was /api/debug/config/shell/preflight/
        // I need to use the NON-DEBUG endpoint to be consistent with ConfigSysadminView
        
        setPreflightLoading(true);
        setPreflightResult(null);
        setPreflightError(null);
        setAckPreflightWarnings(false);
        try {
            // Use standard governed endpoint
            const res = await fetch(apiUrl(`/api/config/shell/preflight/${vid}`)); 
            const data = await res.json();
            if (!res.ok) {
                 // Gated or error
                 setPreflightError(data.error || "Preflight check failed");
                 return;
            }
            setPreflightResult(data);
        } catch (err: any) {
            setPreflightError(err.message);
        } finally {
            setPreflightLoading(false);
        }
    };

    const handleActivate = async (versionId: string) => {
        setActivationMessage(null);
        setShellVersionsError(null);
        try {
            // Use standard governed endpoint
            const res = await fetch(apiUrl('/api/config/shell/activate'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ versionId, reason: activateReason })
            });
            const j = await res.json();
            if (!res.ok) {
                setShellVersionsError(j.error || "Activation failed");
                return;
            }
            
            setActivationMessage(`Successfully activated ${versionId}`);
            setConfirmActivate(false);
            
            // Refresh versions to update 'activeVersionId'
            refreshVersions();
            // Refresh snapshot to update 'activeVersionId' and 'activationReason'
            refreshSnapshot();
        } catch (err: any) {
            setShellVersionsError(`Activation Failed: ${err.message}`);
            setConfirmActivate(false);
        }
    };



    const refreshVersions = async () => {
        setShellVersionsError(null);
        
        const res = await debugFetch('/api/debug/config/shell/versions');
        if (!res) {
             setShellVersions(null);
             return;
        }

        if (!res.ok) return; // Silent fail

        try {
            const j = await res.json();
            setShellVersions(j);
        } catch (e) {
            setShellVersionsError(String(e));
        }
    };

    const fetchVersionDetail = async (vId: string) => {
        setVersionDetailLoading(true);
        setVersionDetailError(null);
        setSelectedVersionDetail(null);
        
        // Reset diff
        setVersionDiff(null);
        setVersionDiffLoading(true);
        setVersionDiffError(null);

        // This is debug-only deep inspection
        const res = await debugFetch(`/api/debug/config/shell/version/${vId}?includeBlocks=1`);
        
        if (!res) {
            setVersionDetailError("Version details unavailable (Debug disabled)");
            setVersionDetailLoading(false);
            setVersionDiffLoading(false);
            return;
        }

        if (!res.ok) {
            setVersionDetailError(`Fetch failed: ${res.status}`);
            setVersionDetailLoading(false);
            setVersionDiffLoading(false);
            return;
        }

        let j;
        try {
            j = await res.json();
            setSelectedVersionDetail(j);
        } catch (e: any) {
            setVersionDetailError(e.message);
            setVersionDetailLoading(false);
            setVersionDiffLoading(false);
            return;
        } finally {
            setVersionDetailLoading(false);
        }

        // Diff Logic vs Parent
        const parentId = j.meta?.parentVersionId;
        if (!parentId) {
            setVersionDiffLoading(false);
            return;
        }

        // Fetch Parent
        const pRes = await debugFetch(`/api/debug/config/shell/version/${parentId}?includeBlocks=1`);
        if (!pRes || !pRes.ok) {
             setVersionDiffLoading(false);
             return;
        }
        
        try {
             const pData = await pRes.json();
             
             // Compute Diff
             const currentBlocks = j.blocks || {};
             const parentBlocks = pData.blocks || {};
             
             const cKeys = Object.keys(currentBlocks);
             const pKeys = Object.keys(parentBlocks);
             
             let added = 0;
             let removed = 0;
             let modified = 0;
             
             // Check Added/Modified
             cKeys.forEach(k => {
                 if (!parentBlocks[k]) added++;
                 else if (JSON.stringify(currentBlocks[k]) !== JSON.stringify(parentBlocks[k])) modified++;
             });
             
             // Check Removed
             pKeys.forEach(k => {
                 if (!currentBlocks[k]) removed++;
             });

             const cManifest = JSON.stringify(j.manifest || {});
             const pManifest = JSON.stringify(pData.manifest || {});
             const manifestChanged = cManifest !== pManifest;

             setVersionDiff({
                 added, removed, modified, manifestChanged, parentId
             });
             setVersionDiffLoading(false);
        } catch (e: any) {
             setVersionDiffError(e.message);
             setVersionDiffLoading(false);
        }
    };

    // Auto-refresh on tab open (no polling)
    useEffect(() => {
        if (activeTab === 'Invocations') {
            refreshInvocations();
        }
        if (activeTab === 'Snapshot') {
            refreshSnapshot();
        }
        if (activeTab === 'Traces') {
            refreshTraces();
        }
        if (activeTab === 'Activations') {
            refreshActivations();
        }
        if (activeTab === 'Versions' && !selectedVersionId && caps.debugEndpointsEnabled) {
            refreshVersions(); // Debug-gated
        }
    }, [activeTab, selectedVersionId, caps.debugEndpointsEnabled]);

    // Persistence Key
    const DRAFT_KEY = 'fole.bootstrap.draftShellConfig';

    // Draft State (Phase 2)
    const [draftBundle, setDraftBundle] = useState<unknown | null>(() => {
        try {
            const raw = localStorage.getItem(DRAFT_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object' && (parsed as any).blocks) {
                    return parsed;
                }
            }
        } catch { /* ignore */ }
        return null;
    });
    const [draftError, setDraftError] = useState<string | null>(null);
    const [draftSelectedBlockId, setDraftSelectedBlockId] = useState<string | null>(null);
    const [draftBlockFilter, setDraftBlockFilter] = useState<string>('');
    const [draftEditorText, setDraftEditorText] = useState<string>('');
    const [draftEditorError, setDraftEditorError] = useState<string | null>(null);
    const [draftEditorDirty, setDraftEditorDirty] = useState<boolean>(false);
    const [draftShowFullJson, setDraftShowFullJson] = useState<boolean>(false);

    useEffect(() => {
        if (activeTab !== 'Node Editor (Button)' || !nodeEditorSelectedId) return;
        const draftBlocks = (draftBundle as any)?.blocks || {};
        const activeBlocks = (bundleData as any)?.blocks || {};
        const draftBlock = findBlockById(draftBlocks, nodeEditorSelectedId);
        const activeBlock = findBlockById(activeBlocks, nodeEditorSelectedId);
        const draftInherit = draftBlock?.data?.inheritFrom;
        const baseInherit = activeBlock?.data?.inheritFrom;
        const inheritFrom = typeof draftInherit === 'string' ? draftInherit : (typeof baseInherit === 'string' ? baseInherit : null);
        setNodeTemplateId(inheritFrom);
        const overridesOnly = draftBlock?.data ? { ...draftBlock.data } : {};
        delete (overridesOnly as any).inheritFrom;
        const flags: Record<string, boolean> = {};
        buttonOverrideFields.forEach(path => {
            flags[path] = hasOwnPath(overridesOnly, path);
        });
        setNodeOverrideFlags(flags);
    }, [activeTab, nodeEditorSelectedId, draftBundle, bundleData]);

    // Windows Registry Editor State
    const [newWinId, setNewWinId] = useState('');
    const [newWinMode, setNewWinMode] = useState<string>('singleton');

    // Overlay Blocks Editor State (Draft)
    const [newOverlayId, setNewOverlayId] = useState('overlay_new');
    const [newOverlayType, setNewOverlayType] = useState('shell.overlay.main_menu');

    // Integration (Draft)
    const [newIntegrationId, setNewIntegrationId] = useState('api_main');
    const [newIntegrationType, setNewIntegrationType] = useState('shell.infra.api.http');

    // Persist to Storage
    useEffect(() => {
        try {
            if (draftBundle) {
                localStorage.setItem(DRAFT_KEY, JSON.stringify(draftBundle));
            } else {
                localStorage.removeItem(DRAFT_KEY);
            }
        } catch { /* ignore */ }
    }, [draftBundle]);

    // Helpers
    const safeJsonStringify = (val: unknown) => {
        try { return JSON.stringify(val, null, 2); } 
        catch { return String(val ?? ''); }
    };

    const copyText = async (key: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedKey(key);
            setTimeout(() => setCopiedKey(null), 1200);
        } catch {
            // Fallback
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            setCopiedKey(key);
            setTimeout(() => setCopiedKey(null), 1200);
        }
    };

    const handleDraftSelectBlock = (id: string, currentDraftArg: unknown = draftBundle) => {
         const currentDraft = currentDraftArg as { blocks: Record<string, {data?: unknown}> } | null;
         if (!currentDraft || !currentDraft.blocks) return;
         const block = currentDraft.blocks[id];
         setDraftSelectedBlockId(id);
         setDraftEditorText(block ? JSON.stringify(block.data ?? {}, null, 2) : '{}');
         setDraftEditorDirty(false);
         setDraftEditorError(null);
         setDraftFixHint(null);
    };

    const handleGoToIntegrity = (id: string, fixPath: string) => {
        handleDraftSelectBlock(id);
        setDraftFixHint(`Fix: ${fixPath}`);
    };

    // Region Normalization Helpers
    type RegionSlot = 'header' | 'viewport' | 'footer';
    const legacyKeyFor: Record<RegionSlot, 'top' | 'main' | 'bottom'> = { header: 'top', viewport: 'main', footer: 'bottom' };

    const readRegionBlockId = (regions: any, slot: RegionSlot): string => {
        if (!regions) return '';
        // Prefer canonical, fallback to legacy
        return regions[slot]?.blockId || regions[legacyKeyFor[slot]]?.blockId || '';
    };

    const writeRegionBlockId = (draft: any, slot: RegionSlot, blockId: string): any => {
        const newDraft = deepClone(draft);
        if (!newDraft.manifest) newDraft.manifest = { title: 'Draft Manifest' };
        if (!newDraft.manifest.regions) newDraft.manifest.regions = {};
        
        // Write canonical ONLY
        if (!newDraft.manifest.regions[slot]) newDraft.manifest.regions[slot] = { blockId: '' };
        newDraft.manifest.regions[slot].blockId = blockId;
        return newDraft;
    };

    const handleRegionChange = (slot: RegionSlot, blockId: string) => {
        if (!draftBundle) return;
        setDraftBundle(writeRegionBlockId(draftBundle, slot, blockId));
    };

    // Windows Registry Helpers
    const handleAddWindow = () => {
        if (!draftBundle || !newWinId.trim()) return;
        const blocks = (draftBundle as any).blocks || {};
        // Support canonical 'window_registry' OR mapped 'infra_windows'
        const infra = blocks['window_registry'] || blocks['infra_windows'];
        
        // Safety check: ensure block exists
        if (!infra || infra.blockType !== 'shell.infra.window_registry') {
            setToast({ message: "Error: 'window_registry' block missing. Runtime may fail.", type: 'error' });
            return;
        }

        const currentWindows = infra.data?.windows || {};
        if (currentWindows[newWinId.trim()]) {
            setToast({ message: `Window ID "${newWinId}" already exists.`, type: 'error' });
            return;
        }

        const newBlocks = deepClone(blocks);
        // Determine which key we found
        const key = blocks['window_registry'] ? 'window_registry' : 'infra_windows';
        
        // Ensure path exists
        if (!newBlocks[key].data) newBlocks[key].data = {};
        if (!newBlocks[key].data.windows) newBlocks[key].data.windows = {};
        
        newBlocks[key].data.windows[newWinId.trim()] = {
            id: newWinId.trim(),
            mode: newWinMode
        };

        const newDraft = { ...(draftBundle as any), blocks: newBlocks };
        setDraftBundle(newDraft);
        setNewWinId(''); // reset input
    };

    const handleRemoveWindow = (wid: string) => {
        if (!draftBundle) return;
        
        setConfirmModal({
             isOpen: true,
             title: "Remove Window",
             message: `Remove window definition "${wid}"?`,
             onConfirm: () => {
                const blocks = (draftBundle as any).blocks || {};
                const key = blocks['window_registry'] ? 'window_registry' : (blocks['infra_windows'] ? 'infra_windows' : null);
                if (key) {
                    const newBlocks = deepClone(blocks);
                    if (newBlocks[key]?.data?.windows) {
                        delete newBlocks[key].data.windows[wid];
                    }
                    setDraftBundle({ ...(draftBundle as any), blocks: newBlocks });
                }
                setConfirmModal(p => ({ ...p, isOpen: false }));
             }
        });
    };

    const handleUpdateWindowMode = (wid: string, newMode: string) => {
        if (!draftBundle) return;
        const blocks = (draftBundle as any).blocks || {};
        const key = blocks['window_registry'] ? 'window_registry' : (blocks['infra_windows'] ? 'infra_windows' : null);
        if (!key) return;
        
        const newBlocks = deepClone(blocks);
        if (newBlocks[key].data?.windows?.[wid]) {
             newBlocks[key].data.windows[wid].mode = newMode;
        }

        setDraftBundle({ ...(draftBundle as any), blocks: newBlocks });
    };

    // Overlay Helper
    const handleCreateOverlay = () => {
        if (!draftBundle || !newOverlayId.trim()) return;
        const blocks = (draftBundle as any).blocks || {};

        let proposedId = newOverlayId.trim();
        // Ensure unique
        if (blocks[proposedId]) {
            let counter = 2;
            while(blocks[`${proposedId}_${counter}`]) counter++;
            proposedId = `${proposedId}_${counter}`;
        }

        const newBlock = {
            schemaVersion: "1.0.0",
            blockId: proposedId,
            blockType: newOverlayType,
            data: { items: [] }, // Default data
            filename: `${proposedId}.json`
        };

        const newDraft = deepClone(draftBundle) as any;
        if (!newDraft.blocks) newDraft.blocks = {};
        newDraft.blocks[proposedId] = newBlock;

        setDraftBundle(newDraft);
        setNewOverlayId('overlay_new'); // reset to default
        handleDraftSelectBlock(proposedId, newDraft);
    };

    const handleCreateIntegration = () => {
        if (!draftBundle || !newIntegrationId.trim()) return;
        const blocks = (draftBundle as any).blocks || {};

        let proposedId = newIntegrationId.trim();
        // Ensure unique
        if (blocks[proposedId]) {
            let counter = 2;
            while(blocks[`${proposedId}_${counter}`]) counter++;
            proposedId = `${proposedId}_${counter}`;
        }

        let defaultData = {};
        if (newIntegrationType === 'shell.infra.api.http') {
            defaultData = { baseUrl: "https://example.com", headers: {}, timeoutMs: 10000 };
        } else if (newIntegrationType === 'shell.infra.db.postgres') {
            defaultData = { host: "localhost", port: 5432, database: "app", user: "app", ssl: false };
        } else if (newIntegrationType === 'shell.infra.db.sqlite') {
            defaultData = { filename: "app.db" };
        }

        const newBlock = {
            schemaVersion: "1.0.0",
            blockId: proposedId,
            blockType: newIntegrationType,
            data: defaultData,
            filename: `${proposedId}.json`
        };

        const newDraft = deepClone(draftBundle) as any;
        if (!newDraft.blocks) newDraft.blocks = {};
        newDraft.blocks[proposedId] = newBlock;

        setDraftBundle(newDraft);
        setNewIntegrationId('api_main'); // reset to default
        handleDraftSelectBlock(proposedId, newDraft);
    };

    const handleDuplicateDraftBlock = (blockId: string) => {
         if (!draftBundle) return;
         const blocks = (draftBundle as any).blocks || {};
         const src = blocks[blockId];
         if (!src) return;

         const base = blockId;
         let newId = `${base}_copy`;
         let counter = 2;
         while (blocks[newId]) {
             newId = `${base}_copy${counter}`;
             counter++;
         }

         const cloned = deepClone(src);
         cloned.blockId = newId;
         if (cloned.id) cloned.id = newId;
         if (cloned.filename) cloned.filename = `${newId}.json`;
         
         const newDraft = { 
             ...(draftBundle as any), 
             blocks: { 
                 ...blocks, 
                 [newId]: cloned 
             } 
         };
         
         setDraftBundle(newDraft);
         handleDraftSelectBlock(newId, newDraft);
    };

    const handleCreateDraft = () => {
        if (!bundleData) {
            setDraftError("No active bundle to clone.");
            return;
        }
        try {
            const clone = deepClone(bundleData);
            
            // Normalize regions to canonical on Clone
            if (clone.manifest) {
                const srcRegions = clone.manifest.regions || {};
                const normRegions: any = {};
                (['header', 'viewport', 'footer'] as RegionSlot[]).forEach(slot => {
                     const bid = readRegionBlockId(srcRegions, slot);
                     if (bid) normRegions[slot] = { blockId: bid };
                });
                clone.manifest.regions = normRegions;
            }

            setDraftBundle(clone);
            setDraftError(null);
            setDraftSelectedBlockId(null);
            setDraftEditorText('');
            setDraftEditorDirty(false);
            
            const blocks = clone.blocks || {};
            const ids = Object.keys(blocks).sort();
            if (ids.length > 0) {
                handleDraftSelectBlock(ids[0], clone);
            }
        } catch (e: unknown) {
            setDraftError("Failed to clone bundle: " + (e instanceof Error ? e.message : String(e)));
        }
    };

    const handleResetDraft = () => {
         setDraftBundle(null);
         setDraftError(null);
         setDraftSelectedBlockId(null);
         setDraftEditorText('');
         setDraftEditorDirty(false);
         setDraftEditorError(null);
         setDraftShowFullJson(false);
    };

    const handleRebaseDraft = () => {
        if (!bundleData) {
            setToast({ message: "No active bundle available to reset from.", type: 'error' });
            return;
        }
        
        const runRebase = () => {
            // Reuse cloning logic (inline to ensure we have access to variables)
            try {
                const clone = deepClone(bundleData);
                
                // Normalize regions
                if (clone.manifest) {
                    const srcRegions = clone.manifest.regions || {};
                    const normRegions: any = {};
                    (['header', 'viewport', 'footer'] as RegionSlot[]).forEach(slot => {
                         const bid = readRegionBlockId(srcRegions, slot);
                         if (bid) normRegions[slot] = { blockId: bid };
                    });
                    clone.manifest.regions = normRegions;
                }
    
                setDraftBundle(clone);
                setDraftError(null);
                setDraftEditorText('');
                setDraftEditorDirty(false);
                setDraftEditorError(null);
                
                // Reset derived/selection state to prevent stale panels
                setDraftSelectedBlockId(null);
                setNodeEditorSelectedId(null);
                setNodeEditorForm({});
                setNodeEditorDirty(false);
                setDraftBlockFilter('');
                
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                setToast({ message: "Draft reset to match Active Bundle.", type: 'success' });
            } catch (e: unknown) {
                setToast({ message: "Failed to reset draft: " + (e instanceof Error ? e.message : String(e)), type: 'error' });
            }
        };

        setConfirmModal({
            isOpen: true,
            title: "Reset Draft from Active?",
            message: "This will DISCARD all unsaved draft changes and replace the draft with the currently active configuration.",
            onConfirm: runRebase
        });
    };

    const handleActivateDraftDeploy = async () => {
        if (!draftBundle) return;
        
        const runDeploy = async () => {
            setConfirmModal(prev => ({ ...prev, isOpen: false }));
            setPendingStage('saving'); 
            setSaveMessage('Deploying draft...');
            
            // Use local proxy (or absolute backend if needed) for standard API logic
            // Centralized API base handling via apiUrl() helper.
    
            // Prepare payload
            // 1. Shallow Copy Bundle to prevent side-effects
            const bundle = { ...(draftBundle as any) };
            if (bundle.blocks) {
                 bundle.blocks = { ...bundle.blocks };
                 
                 // 2. Sanitize specific blocks if we have schema info
                 // This ensures that even if user didn't hit "Save", we clean up empty Enums for button nodes
                 // Note: schemaFields depends on currently loaded `buttonSchema`. 
                 // If user is editing a button, `schemaFields` will be populated.
                 if (schemaFields && schemaFields.length > 0) {
                     const blockIds = Object.keys(bundle.blocks);
                     let targetType = 'ui.node.button';
                     if (activeTab === 'Node Editor (Text)') targetType = 'ui.node.text';
                     if (activeTab === 'Node Editor (Container)') targetType = 'ui.node.container';
                     if (activeTab === 'Node Editor (Window)') targetType = 'ui.node.window';
                     
                     blockIds.forEach(bid => {
                         const blk = bundle.blocks[bid];
                         if (blk && blk.blockType === targetType && blk.data) {
                             // Apply Sanitization
                             blk.data = sanitizeNodeDataForSchema(schemaFields, blk.data);
                         }
                     });
                 }
            }
    
            try {
                // Use standard deploy pipeline which includes validation and graph resolution
                const deployRes = await fetch(apiUrl('/api/config/shell/deploy'), {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        bundle: bundle,
                        message: 'Deployed from Node Editor Draft'
                    })
                });
                
                if (!deployRes.ok) {
                    const err = await deployRes.json();
                    // Check if validation error report provided
                    if (err.report) {
                        const blockErr = err.report.errors?.[0];
                        const errMsg = blockErr ? `${blockErr.code}: ${blockErr.message}` : (err.message || "Validation failed");
                        throw new Error(errMsg);
                    }
                    throw new Error(err.error || err.message || "Deploy failed");
                }
                
                const result = await deployRes.json();
                
                // Success
                setPendingStage('success');
                setSaveMessage(`Deployed ${result.activeVersionId}. Draft retained.`);
                setToast({ message: `Successfully deployed version ${result.activeVersionId}`, type: 'success' });
                
                // Cleanup
                // handleResetDraft(); // Keep draft per user request
                onRefresh(); 
                refreshSnapshot();
                
            } catch (e: any) {
                setPendingStage('error');
                let msg = e.message || "Deploy failed";
                setSaveMessage(msg);
                setToast({ message: "Deploy failed: " + msg, type: 'error' });
            }
        };

        setConfirmModal({
            isOpen: true,
            title: "Confirm Deploy",
            message: "Deploy this draft as a new version to the server?",
            onConfirm: runDeploy
        });
    };

    const handleSaveDraftBlock = () => {
        if (!draftSelectedBlockId || !draftBundle) return;
        try {
            const parsed = JSON.parse(draftEditorText);
            const newDraft = { ...(draftBundle as Record<string, any>) };
            if (!newDraft.blocks) newDraft.blocks = {};
            
            if (!newDraft.blocks[draftSelectedBlockId]) {
                 newDraft.blocks[draftSelectedBlockId] = { id: draftSelectedBlockId, blockId: draftSelectedBlockId, blockType: 'unknown', data: parsed };
            } else {
                 newDraft.blocks[draftSelectedBlockId] = {
                     ...newDraft.blocks[draftSelectedBlockId],
                     data: parsed
                 };
            }
            setDraftBundle(newDraft);
            setDraftEditorDirty(false);
            setDraftEditorError(null);
        } catch (e: unknown) {
            setDraftEditorError("Invalid JSON: " + (e instanceof Error ? e.message : String(e)));
        }
    };
    
    const handleRevertBlock = () => {
        if (!draftSelectedBlockId) return;
        
        let targetData = {};
        const activeBlock = (bundleData as any)?.blocks?.[draftSelectedBlockId];

        if (activeBlock) {
            // Revert to Active
            targetData = activeBlock.data ?? {};
            if (draftBundle) {
                 const newDraft = { ...(draftBundle as Record<string, any>) };
                 if (newDraft.blocks && newDraft.blocks[draftSelectedBlockId]) {
                      newDraft.blocks[draftSelectedBlockId] = deepClone(activeBlock);
                 }
                 setDraftBundle(newDraft);
            }
        } else {
            // Revert to Saved Draft (undo text changes)
            const draftB = draftBundle as Record<string, any>;
            const savedDraftBlock = draftB?.blocks?.[draftSelectedBlockId];
            if (savedDraftBlock) {
                 targetData = savedDraftBlock.data ?? {};
            }
        }
        
        setDraftEditorText(JSON.stringify(targetData, null, 2));
        setDraftEditorDirty(false);
        setDraftEditorError(null);
    };

    const handleDuplicateBlock = () => {
        const blocks = (draftBundle as any).blocks || {};
        const selectedBlock = draftSelectedBlockId ? blocks[draftSelectedBlockId] : null;

        if (!selectedBlock || !draftBundle) return;
        
        const base = selectedBlock.blockId || selectedBlock.id || draftSelectedBlockId || 'unknown';
        let newId = `${base}_copy`;
        let counter = 2;
        
        while (blocks[newId]) {
            newId = `${base}_copy${counter}`;
            counter++;
        }
        
        const cloned = deepClone(selectedBlock) as any;
        cloned.blockId = newId;
        if (cloned.id) cloned.id = newId;
        if (cloned.filename) cloned.filename = `${newId}.json`;
        
        const newDraft = { 
            ...(draftBundle as any), 
            blocks: { 
                ...blocks, 
                [newId]: cloned 
            } 
        };
        
        setDraftBundle(newDraft);
        handleDraftSelectBlock(newId, newDraft);
    };

    const handleDeleteBlock = () => {
        if (!draftSelectedBlockId || !draftBundle) return;
        
        setConfirmModal({
            isOpen: true,
            title: "Delete Block",
            message: `Delete block "${draftSelectedBlockId}" from Draft?`,
            onConfirm: () => {
                const newDraft = deepClone(draftBundle) as any;
                if (newDraft.blocks) {
                    delete newDraft.blocks[draftSelectedBlockId];
                }
                
                setDraftBundle(newDraft);
                setShowDeletePreview(false);
                
                // Update selection
                const remaining = Object.keys(newDraft.blocks || {}).sort();
                if (remaining.length > 0) {
                    // Try to select next or previous, or just first
                    handleDraftSelectBlock(remaining[0], newDraft); 
                } else {
                    setDraftSelectedBlockId(null);
                    setDraftEditorText('');
                    setDraftEditorDirty(false);
                }
                setConfirmModal(p => ({ ...p, isOpen: false }));
            }
        });
    };

    const draftDiff = useMemo(() => {
        if (!bundleData || !draftBundle) return { added: [], removed: [], modified: [], manifestChanged: false };
        const activeBlocks = (bundleData as any).blocks || {};
        const draftBlocks = (draftBundle as any).blocks || {};
        const activeKeys = Object.keys(activeBlocks);
        const draftKeys = Object.keys(draftBlocks);
        
        const added = draftKeys.filter(k => !activeBlocks[k]);
        const removed = activeKeys.filter(k => !draftBlocks[k]);
        const modified = draftKeys.filter(k => activeBlocks[k] && JSON.stringify(activeBlocks[k]) !== JSON.stringify(draftBlocks[k]));
        
        const manifestChanged = JSON.stringify((bundleData as any).manifest) !== JSON.stringify((draftBundle as any).manifest);

        return { added, removed, modified, manifestChanged };
    }, [bundleData, draftBundle]);

    const validationResult = useMemo(() => {
        const res = { errors: [] as string[], warnings: [] as string[], status: 'SAFE' };
        if (!draftBundle) {
             res.status = 'No draft';
             return res;
        }

        const blocks = (draftBundle as any).blocks || {};
        const blockIds = Object.keys(blocks);

        blockIds.forEach(key => {
            const b = blocks[key];
            const bid = b.blockId || b.id;
            
            // Core fields
            if (!bid) res.errors.push(`Block at key "${key}" missing blockId`);
            if (!b.blockType) res.errors.push(`Block "${key}" missing blockType`);
            if (!b.schemaVersion) res.warnings.push(`Block "${bid || key}" missing schemaVersion`);

            // ID mismatch check
            if (bid && bid !== key) res.warnings.push(`Block key "${key}" matches blockId "${bid}"? Mismatch can cause issues.`);
            
            // Type specific checks
            if (b.blockType === 'binding') {
                const data = b.data || {};
                // Trigger source check
                const triggerSrc = data.mapping?.trigger?.sourceBlockId;
                if (triggerSrc && !blocks[triggerSrc]) {
                    res.warnings.push(`Binding "${bid}" references missing sourceBlockId "${triggerSrc}"`);
                }
                
                // Endpoint targets check
                if (Array.isArray(data.endpoints)) {
                    data.endpoints.forEach((ep: any, idx: number) => {
                        const tgt = ep.target?.blockId;
                        if (tgt && !blocks[tgt]) {
                             res.warnings.push(`Binding "${bid}" endpoint[${idx}] references missing target blockId "${tgt}"`);
                        }
                    });
                }
            } else if (b.blockType === 'shell.infra.api.http') {
                if (!(b.data?.baseUrl)) res.warnings.push(`Integration "${bid}" missing required field 'baseUrl'.`);
            } else if (b.blockType === 'shell.infra.db.postgres') {
                if (!(b.data?.host)) res.warnings.push(`Integration "${bid}" missing required field 'host'.`);
                if (!(b.data?.database)) res.warnings.push(`Integration "${bid}" missing required field 'database'.`);
            } else if (b.blockType === 'shell.infra.db.sqlite') {
                if (!(b.data?.filename)) res.warnings.push(`Integration "${bid}" missing required field 'filename'.`);
            }
        });

        // Regions check
        const regions = (draftBundle as any).manifest?.regions || {};
        (['header', 'viewport', 'footer'] as RegionSlot[]).forEach(slot => {
             const regionBid = readRegionBlockId(regions, slot);
             if (regionBid && regionBid !== '(none)' && !blocks[regionBid]) {
                 res.warnings.push(`Region "${slot}" references missing blockId "${regionBid}"`);
             }
        });

        // Windows Registry Check
        const infra = blocks['window_registry'] || blocks['infra_windows'];
        if (!infra) {
             res.warnings.push(`Block "window_registry" is missing. Runtime may fail.`);
        } else if (!infra.data?.windows) {
             res.warnings.push(`Block "window_registry" missing data.windows.`);
        }

        if (res.errors.length > 0) res.status = 'BLOCKED';
        else if (res.warnings.length > 0) res.status = 'WARNINGS';
        
        return res;
    }, [draftBundle]);

    // EPIC 2: Reset confirmApply on context changes
    useEffect(() => {
        setConfirmApply(false);
    }, [
        activeTab,
        draftSelectedBlockId,
        draftBundle,
        validationResult?.status
    ]);

    const [showValidationDetails, setShowValidationDetails] = useState(false);
    const [showDataDiff, setShowDataDiff] = useState(false);
    
    const [draftValidateOk, setDraftValidateOk] = useState(false);

    // Delete Preview State
    const [showDeletePreview, setShowDeletePreview] = useState(false);
    const [draftFixHint, setDraftFixHint] = useState<string | null>(null);

    const deleteImpact = useMemo(() => {
        if (!draftBundle || !draftSelectedBlockId) return { referencedByBindings: [] };
        
        const res = { referencedByBindings: [] as Array<{ bindingId: string; kind: 'trigger.sourceBlockId' | 'endpoint.target.blockId'; detail: string }> };
        const blocks = (draftBundle as any).blocks || {};
        
        Object.values(blocks).forEach((b: any) => {
             if (b.blockType === 'binding') {
                 const data = b.data || {};
                 const bid = b.blockId || b.id;
                 
                 // Check trigger source
                 if (data.mapping?.trigger?.sourceBlockId === draftSelectedBlockId) {
                     res.referencedByBindings.push({ 
                         bindingId: bid, 
                         kind: 'trigger.sourceBlockId', 
                         detail: `Trigger in binding "${bid}"` 
                     });
                 }
                 
                 // Check endpoints
                 if (Array.isArray(data.endpoints)) {
                     data.endpoints.forEach((ep: any, idx: number) => {
                         if (ep.target?.blockId === draftSelectedBlockId) {
                             res.referencedByBindings.push({
                                 bindingId: bid,
                                 kind: 'endpoint.target.blockId',
                                 detail: `Endpoint [${idx}] in binding "${bid}"`
                             });
                         }
                     });
                 }
             }
        });
        
        return res;
    }, [draftBundle, draftSelectedBlockId]);

    const draftIntegrityIssues = useMemo(() => {
        const issues: Array<{ severity: 'WARN' | 'ERROR'; bindingId: string; kind: string; missingBlockId: string; details: string; jsonPath: string }> = [];
        if (!draftBundle) return issues;
        
        const blocks = (draftBundle as any).blocks || {};
        
        Object.values(blocks).forEach((b: any) => {
             if (b.blockType === 'binding') {
                 const data = b.data || {};
                 const bid = b.blockId || b.id;
                 
                 // Check trigger source
                 const triggerSrc = data.mapping?.trigger?.sourceBlockId;
                 if (triggerSrc && !blocks[triggerSrc]) {
                     issues.push({
                         severity: 'WARN',
                         bindingId: bid,
                         kind: 'missing sourceBlockId',
                         missingBlockId: triggerSrc,
                         details: `Binding "${bid}" triggers from missing block "${triggerSrc}"`,
                         jsonPath: 'data.mapping.trigger.sourceBlockId'
                     });
                 }
                 
                 // Check endpoints
                 if (Array.isArray(data.endpoints)) {
                     data.endpoints.forEach((ep: any, idx: number) => {
                         const tgt = ep.target?.blockId;
                         if (tgt && !blocks[tgt]) {
                             issues.push({
                                 severity: 'WARN',
                                 bindingId: bid,
                                 kind: 'missing endpoint target',
                                 missingBlockId: tgt,
                                 details: `Binding "${bid}" endpoint[${idx}] targets missing block "${tgt}"`,
                                 jsonPath: `data.endpoints[${idx}].target.blockId`
                             });
                         }
                     });
                 }
             }
        });
        
        // Regions check
        const regions = (draftBundle as any).manifest?.regions || {};
        (['header', 'viewport', 'footer'] as RegionSlot[]).forEach(slot => {
             const regionBid = readRegionBlockId(regions, slot);
             if (regionBid && regionBid !== '(none)' && !blocks[regionBid]) {
                 issues.push({
                     severity: 'WARN',
                     bindingId: 'MANIFEST', // Special ID
                     kind: `missing region ${slot}`,
                     missingBlockId: regionBid,
                     details: `Region "${slot}" references missing block "${regionBid}"`,
                     jsonPath: `manifest.regions.${slot}.blockId`
                 });
             }
        });

        return issues;
    }, [draftBundle]);

    // Diff Helper
    const diffData = (obj1: unknown, obj2: unknown, path = '', results: any[] = []) => {
        if (results.length > 50) return results; // Guardrail

        const isObj1 = obj1 && typeof obj1 === 'object';
        const isObj2 = obj2 && typeof obj2 === 'object';
        
        // If primitive change or one is obj and other is not
        if (!isObj1 || !isObj2) {
             if (JSON.stringify(obj1) !== JSON.stringify(obj2)) {
                 results.push({ path: path || 'root', before: obj1, after: obj2 });
             }
             return results;
        }

        const o1 = obj1 as Record<string, unknown>;
        const o2 = obj2 as Record<string, unknown>;

        // Both objects/arrays: recurse keys
        const keys1 = Object.keys(o1);
        const keys2 = Object.keys(o2);
        const allKeys = Array.from(new Set([...keys1, ...keys2]));
        
        for (const key of allKeys) {
             if (results.length > 50) break;
             const newPath = path ? `${path}.${key}` : key;
             const val1 = o1[key];
             const val2 = o2[key];
             
             if (JSON.stringify(val1) !== JSON.stringify(val2)) {
                  if (val1 && typeof val1 === 'object' && val2 && typeof val2 === 'object') {
                       diffData(val1, val2, newPath, results);
                  } else {
                       results.push({ path: newPath, before: val1, after: val2 });
                  }
             }
        }
        return results;
    };

    // Shared Copy Button Style
    const CopyBtn = ({ k, text, label = 'Copy JSON' }: { k: string, text: unknown, label?: string }) => {
        const isCopied = copiedKey === k;
        return (
            <button 
                onClick={(e) => { e.stopPropagation(); copyText(k, typeof text === 'string' ? text : safeJsonStringify(text)); }}
                style={{
                    padding:'2px 8px', 
                    fontSize:'11px', 
                    cursor:'pointer', 
                    border: isCopied ? '1px solid #4caf50' : '1px solid #ccc',
                    background: isCopied ? '#e8f5e9' : 'white',
                    color: isCopied ? '#2e7d32' : '#333',
                    borderRadius: '4px',
                    marginLeft: 'auto'
                }}
            >
                {isCopied ? 'Copied!' : label}
            </button>
        );
    };

    // Runtime Toggle State
    const [runtimeSections, setRuntimeSections] = useState({ 
        windows: true, 
        overlays: true, 
        lastResult: true, 
        plan: false 
    });
    void runtimeSections;
    void setRuntimeSections;

    type SessionBanner = {
        kind: 'success' | 'error';
        message: string;
        ts: number;
        action?: 'reload';
    };
    const SESSION_BANNER_KEY = 'fole.sysadmin.sessionBanner';
    const [sessionBanner, setSessionBanner] = useState<SessionBanner | null>(() => {
        try {
            const raw = sessionStorage.getItem(SESSION_BANNER_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as SessionBanner;
            if (!parsed || !parsed.message || !parsed.kind || !parsed.ts) return null;
            return parsed;
        } catch {
            return null;
        }
    });
    const bannerTimerRef = useRef<number | null>(null);
    const dismissBanner = () => {
        if (bannerTimerRef.current) {
            clearTimeout(bannerTimerRef.current);
            bannerTimerRef.current = null;
        }
        setSessionBanner(null);
        try {
            sessionStorage.removeItem(SESSION_BANNER_KEY);
        } catch {
            // ignore
        }
    };
    const showBanner = (next: SessionBanner) => {
        if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
        setSessionBanner(next);
        try {
            sessionStorage.setItem(SESSION_BANNER_KEY, JSON.stringify(next));
        } catch {
            // ignore
        }
    };
    const syncSessionBannerFromStorage = () => {
        try {
            const raw = sessionStorage.getItem(SESSION_BANNER_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw) as SessionBanner;
            if (!parsed || !parsed.message || !parsed.kind || !parsed.ts) return;
            setSessionBanner(parsed);
        } catch {
            // ignore
        }
    };
    useEffect(() => {
        const handler = () => syncSessionBannerFromStorage();
        syncSessionBannerFromStorage();
        window.addEventListener('fole:session-banner', handler);
        return () => window.removeEventListener('fole:session-banner', handler);
    }, []);
    useEffect(() => {
        if (!sessionBanner) return;
        if (sessionBanner.action === 'reload') return;
        if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
        const elapsed = Date.now() - sessionBanner.ts;
        const remaining = Math.max(0, 8000 - elapsed);
        bannerTimerRef.current = window.setTimeout(() => {
            dismissBanner();
        }, remaining);
    }, [sessionBanner?.ts, sessionBanner?.action]);
    useEffect(() => {
        return () => {
            if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
        };
    }, []);

    const [isApplying, setIsApplying] = useState(false);

    // Derived State (Data tab)
    const [derivedPatches, setDerivedPatches] = useState<DerivedPatches | null>(null);
    const [derivedPatchesError, setDerivedPatchesError] = useState<string | null>(null);
    const [selectedDataBlockId, setSelectedDataBlockId] = useState<string | null>(null);
    const lastDerivedFetchKeyRef = useRef<string | null>(null);
    const [dataStaticDraft, setDataStaticDraft] = useState("");
    const [dataStaticStatus, setDataStaticStatus] = useState<string | null>(null);
    const [dataStaticError, setDataStaticError] = useState<string | null>(null);
    const [dataStaticSaving, setDataStaticSaving] = useState(false);
    const [dataStaticJsonText, setDataStaticJsonText] = useState('');
    const [dataStaticJsonBaseline, setDataStaticJsonBaseline] = useState('');
    const [dataStaticJsonError, setDataStaticJsonError] = useState<string | null>(null);
    const [dataStaticJsonDirty, setDataStaticJsonDirty] = useState(false);
    const [nodeDraftSaving, setNodeDraftSaving] = useState(false);
    const [blocksDraftSaving, setBlocksDraftSaving] = useState(false);
    const [bindingsDraftSaving, setBindingsDraftSaving] = useState(false);
    const [lastDraftVersionId, setLastDraftVersionId] = useState<string | null>(null);
    const [activateDraftReason, setActivateDraftReason] = useState('');
    const [showActivateDraftModal, setShowActivateDraftModal] = useState(false);
    const [activateDraftSaving, setActivateDraftSaving] = useState(false);
    const [blocksEditorText, setBlocksEditorText] = useState('');
    const [blocksEditorBaseline, setBlocksEditorBaseline] = useState('');
    const [blocksEditorError, setBlocksEditorError] = useState<string | null>(null);
    const [blocksEditorDirty, setBlocksEditorDirty] = useState(false);
    const [bindingsEditorText, setBindingsEditorText] = useState('');
    const [bindingsEditorBaseline, setBindingsEditorBaseline] = useState('');
    const [bindingsEditorError, setBindingsEditorError] = useState<string | null>(null);
    const [bindingsEditorDirty, setBindingsEditorDirty] = useState(false);
    const [themeTokensEditorText, setThemeTokensEditorText] = useState('');
    const [themeTokensEditorBaseline, setThemeTokensEditorBaseline] = useState('');
    const [themeTokensEditorError, setThemeTokensEditorError] = useState<string | null>(null);
    const [themeTokensEditorDirty, setThemeTokensEditorDirty] = useState(false);
    const [themeTokensDraftSaving, setThemeTokensDraftSaving] = useState(false);

    type ActivationFilter = 'all' | 'success' | 'failure';
    const [activationFilter, setActivationFilter] = useState<ActivationFilter>('all');

    const dataBlocks = useMemo(() => {
        const blocksMap = (bundleData as any)?.blocks || {};
        return Object.values(blocksMap)
            .filter((b: any) => typeof b?.blockType === 'string' && b.blockType.startsWith('data.'))
            .map((b: any) => ({
                blockId: (b.blockId || b.id) as string,
                blockType: b.blockType as string,
                data: b.data
            }))
            .filter((b: any) => !!b.blockId);
    }, [bundleData]);

    const themeTokensBlock = useMemo(() => {
        const blocksMap = (bundleData as any)?.blocks || {};
        const blocksArr = Array.isArray(blocksMap)
            ? blocksMap
            : typeof blocksMap === 'object'
                ? Object.values(blocksMap)
                : [];
        return blocksArr.find((b: any) => b?.blockType === 'shell.infra.theme_tokens') || null;
    }, [bundleData]);

    const themeTokens = useMemo(() => {
        const tokens = (themeTokensBlock as any)?.data?.tokens;
        return tokens && typeof tokens === 'object' ? tokens as Record<string, unknown> : {};
    }, [themeTokensBlock]);

    const getThemeToken = (key: string, fallback: string) => {
        const val = themeTokens[key];
        return typeof val === 'string' && val.trim().length > 0 ? val : fallback;
    };

    const primaryColor = getThemeToken('primaryColor', '#e65100');

    const fetchDerivedPatches = async () => {
        const versionKey = snapshotData?.activeVersionId || 'active';
        if (lastDerivedFetchKeyRef.current === versionKey && derivedPatches) return;
        lastDerivedFetchKeyRef.current = versionKey;

        try {
            const res = await fetch(apiUrl('/api/runtime/bindings/derived-state'));
            if (!res.ok) {
                const txt = await res.text().catch(() => '');
                setDerivedPatchesError(`Error ${res.status}: ${txt || 'Failed to load derived state'}`);
                setDerivedPatches(null);
                return;
            }
            const json = await res.json();
            setDerivedPatches(json.patchesByBlockId || {});
            setDerivedPatchesError(null);
        } catch (err: any) {
            setDerivedPatchesError(String(err));
            setDerivedPatches(null);
        }
    };

    const refreshDerivedState = async () => {
        await fetchDerivedPatches();
    };
    const localRefresh: SysRefresh = {
        bundle: onRefresh,
        resolvedGraph: refreshResolvedGraph,
        derived: refreshDerivedState,
        snapshot: refreshSnapshot
    };

    useEffect(() => {
        if (activeTab === 'Data' || activeTab === 'Bindings') {
            fetchDerivedPatches();
        }
    }, [activeTab, snapshotData?.activeVersionId]);

    useEffect(() => {
        if (activeTab !== 'Data') return;
        if (dataBlocks.length === 0) {
            if (selectedDataBlockId !== null) setSelectedDataBlockId(null);
            return;
        }
        const exists = selectedDataBlockId && dataBlocks.some(b => b.blockId === selectedDataBlockId);
        if (!exists) {
            setSelectedDataBlockId(dataBlocks[0].blockId);
        }
    }, [activeTab, dataBlocks, selectedDataBlockId]);

    const handleSaveDataStatic = async () => {
        const selectedBlock = dataBlocks.find(b => b.blockId === selectedDataBlockId) || dataBlocks[0];
        if (!selectedBlock || selectedBlock.blockType !== 'data.static') return;

        setDataStaticSaving(true);
        setDataStaticStatus(null);
        setDataStaticError(null);
        try {
            const res = await governedFetch(`/api/v1/config/blocks/${encodeURIComponent(selectedBlock.blockId)}/patch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patch: { data: { value: dataStaticDraft } },
                    message: 'Sysadmin data edit'
                })
            });

            if (!res) {
                const msg = 'Save failed (no response)';
                setDataStaticError(msg);
                showBanner({ kind: 'error', message: `Save failed: ${msg}`, ts: Date.now() });
                return;
            }

            if (!res.ok) {
                const txt = await res.text().catch(() => '');
                const msg = `Save failed (${res.status})${txt ? `: ${txt}` : ''}`;
                setDataStaticError(msg);
                showBanner({ kind: 'error', message: `Save failed: ${msg}`, ts: Date.now() });
                return;
            }

            const json = await res.json();
            if (json?.ok === false) {
                const msg = json?.error?.message || 'Save failed';
                setDataStaticError(msg);
                showBanner({ kind: 'error', message: `Save failed: ${msg}`, ts: Date.now() });
                return;
            }
            const payload = json?.data ?? json?.result ?? null;
            const newVersionId = payload?.newVersionId;
            const statusMsg = newVersionId ? `Draft saved: ${newVersionId}` : 'Draft saved';
            setDataStaticStatus(statusMsg);
            showBanner({ kind: 'success', message: statusMsg, ts: Date.now() });
            setLastDraftVersionId(newVersionId || null);
        } catch (e: any) {
            const msg = e?.message || String(e);
            setDataStaticError(msg);
            showBanner({ kind: 'error', message: `Save failed: ${msg}`, ts: Date.now() });
        } finally {
            setDataStaticSaving(false);
        }
    };

    const handleSaveDataStaticJson = async () => {
        const selectedBlock = dataBlocks.find(b => b.blockId === selectedDataBlockId) || dataBlocks[0];
        if (!selectedBlock || selectedBlock.blockType !== 'data.static') return;

        const parsed = parseJsonSafely(dataStaticJsonText);
        if (parsed.error || parsed.value === null) {
            setDataStaticJsonError(parsed.error || 'Invalid JSON');
            showBanner({ kind: 'error', message: `Save failed: ${parsed.error || 'Invalid JSON'}`, ts: Date.now() });
            return;
        }

        const schema = blockSchemas['data.static'];
        const validation = validateWithSchemaMinimal(schema, parsed.value);
        if (!validation.valid) {
            const msg = validation.errors.join('; ');
            setDataStaticJsonError(msg || 'Schema validation failed');
            showBanner({ kind: 'error', message: `Save failed: ${msg || 'Schema validation failed'}`, ts: Date.now() });
            return;
        }

        setDataStaticSaving(true);
        setDataStaticStatus(null);
        setDataStaticError(null);
        try {
            const res = await governedFetch(`/api/v1/config/blocks/${encodeURIComponent(selectedBlock.blockId)}/patch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patch: { data: parsed.value },
                    message: 'Sysadmin data edit (advanced)'
                })
            });

            if (!res) {
                const msg = 'Save failed (no response)';
                setDataStaticError(msg);
                showBanner({ kind: 'error', message: `Save failed: ${msg}`, ts: Date.now() });
                return;
            }

            if (!res.ok) {
                const txt = await res.text().catch(() => '');
                const msg = `Save failed (${res.status})${txt ? `: ${txt}` : ''}`;
                setDataStaticError(msg);
                showBanner({ kind: 'error', message: `Save failed: ${msg}`, ts: Date.now() });
                return;
            }

            const json = await res.json();
            if (json?.ok === false) {
                const msg = json?.error?.message || 'Save failed';
                setDataStaticError(msg);
                showBanner({ kind: 'error', message: `Save failed: ${msg}`, ts: Date.now() });
                return;
            }
            const payload = json?.data ?? json?.result ?? null;
            const newVersionId = payload?.newVersionId;
            const statusMsg = newVersionId ? `Draft saved: ${newVersionId}` : 'Draft saved';
            setDataStaticStatus(statusMsg);
            showBanner({ kind: 'success', message: statusMsg, ts: Date.now() });
            setLastDraftVersionId(newVersionId || null);

            const nextBaseline = JSON.stringify(parsed.value, null, 2);
            setDataStaticJsonBaseline(nextBaseline);
            setDataStaticJsonText(nextBaseline);
            setDataStaticJsonError(null);
            setDataStaticJsonDirty(false);

            const nextValue = (parsed.value as any)?.value;
            if (typeof nextValue === 'string') {
                setDataStaticDraft(nextValue);
            }
        } catch (e: any) {
            const msg = e?.message || String(e);
            setDataStaticError(msg);
            showBanner({ kind: 'error', message: `Save failed: ${msg}`, ts: Date.now() });
        } finally {
            setDataStaticSaving(false);
        }
    };

    const handleSaveThemeTokensDraft = async () => {
        if (!themeTokensBlock) return;
        const blockId = (themeTokensBlock as any)?.blockId || (themeTokensBlock as any)?.id;
        if (!blockId || typeof blockId !== 'string') return;

        const parsed = parseJsonSafely(themeTokensEditorText);
        if (parsed.error || parsed.value === null) {
            setThemeTokensEditorError(parsed.error || 'Invalid JSON');
            showBanner({ kind: 'error', message: `Save failed: ${parsed.error || 'Invalid JSON'}`, ts: Date.now() });
            return;
        }

        const schema = blockSchemas['shell.infra.theme_tokens'];
        const validation = schema ? validateWithSchemaMinimal(schema, parsed.value) : { valid: true, errors: [] as string[] };
        if (!validation.valid) {
            const msg = validation.errors.join('; ');
            setThemeTokensEditorError(msg || 'Schema validation failed');
            showBanner({ kind: 'error', message: `Save failed: ${msg || 'Schema validation failed'}`, ts: Date.now() });
            return;
        }

        setThemeTokensDraftSaving(true);
        try {
            const res = await governedFetch(`/api/v1/config/blocks/${encodeURIComponent(blockId)}/patch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patch: { data: parsed.value },
                    message: 'Theme tokens draft save'
                })
            });

            if (!res) {
                const msg = 'Save failed (no response)';
                showBanner({ kind: 'error', message: `Save failed: ${msg}`, ts: Date.now() });
                return;
            }

            if (!res.ok) {
                const txt = await res.text().catch(() => '');
                const msg = `Save failed (${res.status})${txt ? `: ${txt}` : ''}`;
                showBanner({ kind: 'error', message: `Save failed: ${msg}`, ts: Date.now() });
                return;
            }

            const json = await res.json();
            if (json?.ok === false) {
                const msg = json?.error?.message || 'Save failed';
                showBanner({ kind: 'error', message: `Save failed: ${msg}`, ts: Date.now() });
                return;
            }

            const payload = json?.data ?? json?.result ?? null;
            const newVersionId = payload?.newVersionId;
            const statusMsg = newVersionId ? `Draft saved: ${newVersionId}` : 'Draft saved';
            showBanner({ kind: 'success', message: statusMsg, ts: Date.now() });
            setLastDraftVersionId(newVersionId || null);

            const nextBaseline = JSON.stringify(parsed.value, null, 2);
            setThemeTokensEditorBaseline(nextBaseline);
            setThemeTokensEditorText(nextBaseline);
            setThemeTokensEditorError(null);
            setThemeTokensEditorDirty(false);
        } catch (e: any) {
            const msg = e?.message || String(e);
            showBanner({ kind: 'error', message: `Save failed: ${msg}`, ts: Date.now() });
        } finally {
            setThemeTokensDraftSaving(false);
        }
    };

    const handleActivateDataStaticVersion = async () => {
        if (!lastDraftVersionId) return;
        const reason = activateDraftReason.trim();
        if (!reason) {
            const msg = 'Activation reason is required';
            setDataStaticError(msg);
            showBanner({ kind: 'error', message: `Save failed: ${msg}`, ts: Date.now() });
            return;
        }

        setActivateDraftSaving(true);
        setIsApplying(true);
        setDataStaticStatus(null);
        setDataStaticError(null);

        try {
            const res = await governedFetch('/api/v1/config/activate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ versionId: lastDraftVersionId, reason })
            });

            if (!res) {
                const msg = 'Activation failed (no response)';
                setDataStaticError(msg);
                showBanner({ kind: 'error', message: `Save failed: ${msg}`, ts: Date.now() });
                return;
            }

            const json = await res.json().catch(() => null);
            if (!res.ok || json?.ok === false) {
                const msg = json?.error?.message || `Activation failed (${res.status})`;
                setDataStaticError(msg);
                showBanner({ kind: 'error', message: `Save failed: ${msg}`, ts: Date.now() });
                return;
            }

            const payload = json?.data ?? json?.result ?? null;
            const toVersionId = payload?.toVersionId || lastDraftVersionId;
            const statusMsg = `Activated: ${toVersionId}`;
            setDataStaticStatus(statusMsg);
            showBanner({ kind: 'success', message: statusMsg, ts: Date.now() });

            await localRefresh.bundle();
            localRefresh.resolvedGraph();
            await localRefresh.derived();
            await localRefresh.snapshot();

            setLastDraftVersionId(null);
            setShowActivateDraftModal(false);
            setActivateDraftReason('');
        } catch (e: any) {
            const msg = e?.message || String(e);
            setDataStaticError(msg);
            showBanner({ kind: 'error', message: `Save failed: ${msg}`, ts: Date.now() });
        } finally {
            setActivateDraftSaving(false);
            setIsApplying(false);
        }
    };

    useEffect(() => {
        if (activeTab !== 'Data') return;
        const selectedBlock = dataBlocks.find(b => b.blockId === selectedDataBlockId) || dataBlocks[0];
        if (selectedBlock?.blockType === 'data.static') {
            const nextValue = (selectedBlock.data as any)?.value;
            if (typeof nextValue === 'string') {
                setDataStaticDraft(nextValue);
            } else if (nextValue !== undefined) {
                setDataStaticDraft(JSON.stringify(nextValue, null, 2));
            } else {
                setDataStaticDraft('');
            }
            const nextJson = JSON.stringify(selectedBlock.data ?? {}, null, 2);
            setDataStaticJsonText(nextJson);
            setDataStaticJsonBaseline(nextJson);
            setDataStaticJsonError(null);
            setDataStaticJsonDirty(false);
        } else {
            setDataStaticDraft('');
            setDataStaticJsonText('');
            setDataStaticJsonBaseline('');
            setDataStaticJsonError(null);
            setDataStaticJsonDirty(false);
        }
        setDataStaticStatus(null);
        setDataStaticError(null);
    }, [activeTab, dataBlocks, selectedDataBlockId]);

    useEffect(() => {
        if (!bundleData || !selectedBlockId) {
            setBlocksEditorText('');
            setBlocksEditorBaseline('');
            setBlocksEditorError(null);
            setBlocksEditorDirty(false);
            return;
        }

        const block = findBlockById((bundleData as any)?.blocks, selectedBlockId);
        const data = block?.data ?? {};
        const baseline = JSON.stringify(data, null, 2);
        setBlocksEditorText(baseline);
        setBlocksEditorBaseline(baseline);
        setBlocksEditorError(null);
        setBlocksEditorDirty(false);
    }, [bundleData, selectedBlockId]);

    useEffect(() => {
        if (!bundleData || !selectedBindingId) {
            setBindingsEditorText('');
            setBindingsEditorBaseline('');
            setBindingsEditorError(null);
            setBindingsEditorDirty(false);
            return;
        }

        const block = findBlockById((bundleData as any)?.blocks, selectedBindingId);
        const data = block?.data ?? {};
        const baseline = JSON.stringify(data, null, 2);
        setBindingsEditorText(baseline);
        setBindingsEditorBaseline(baseline);
        setBindingsEditorError(null);
        setBindingsEditorDirty(false);
    }, [bundleData, selectedBindingId]);

    useEffect(() => {
        if (!themeTokensBlock) {
            setThemeTokensEditorText('');
            setThemeTokensEditorBaseline('');
            setThemeTokensEditorError(null);
            setThemeTokensEditorDirty(false);
            return;
        }

        const data = (themeTokensBlock as any)?.data ?? {};
        const baseline = JSON.stringify(data, null, 2);
        setThemeTokensEditorText(baseline);
        setThemeTokensEditorBaseline(baseline);
        setThemeTokensEditorError(null);
        setThemeTokensEditorDirty(false);
    }, [themeTokensBlock]);

    // --- ActionIndex Memoization ---
    const allActions = runtimePlan?.actions || [];
    
    const { groupedActions, sortedKeys, totalVisible, totalSources } = useMemo(() => {
        if (activeTab !== 'ActionIndex') {
            return { groupedActions: new Map(), sortedKeys: [], totalVisible: 0, totalSources: 0 };
        }

        const f = filter.toLowerCase();
        const filtered = allActions.filter(a => {
            const id = a.id || '';
            const name = a.actionName || '';
            const src = a.sourceBlockId || '';
            return !f || 
                    id.toLowerCase().includes(f) || 
                    name.toLowerCase().includes(f) || 
                    src.toLowerCase().includes(f);
        });
        
        const groups = new Map<string, ActionDefinition[]>();
        filtered.forEach(a => {
            if (!groups.has(a.sourceBlockId)) groups.set(a.sourceBlockId, []);
            groups.get(a.sourceBlockId)!.push(a);
        });
        const keys = Array.from(groups.keys()).sort();

        return {
            filteredActions: filtered,
            groupedActions: groups,
            sortedKeys: keys,
            totalVisible: filtered.length,
            totalSources: keys.length
        };
    }, [activeTab, filter, allActions]);


    const [confirmLoadVersion, setConfirmLoadVersion] = useState(false);

    const handleLoadVersionToDraft = async () => {
         if (!selectedVersionId) return;
         
         const res = await debugFetch(`/api/debug/config/shell/version/${selectedVersionId}?includeBlocks=1`);

         if (!res) {
             setConfirmLoadVersion(false);
             setToast({ message: "Cannot load version: Debug endpoints check failed.", type: 'error' });
             return;
         }

         if (res.status === 413) {
             setToast({ message: "Version too large to load into draft (limit exceeded).", type: 'error' });
             setConfirmLoadVersion(false);
             return;
         }
         
         if (!res.ok) {
             const txt = await res.text().catch(() => '');
             setToast({ message: `Fetch failed (${res.status}): ${txt}`, type: 'error' });
             setConfirmLoadVersion(false);
             return;
         }

         try {
             const fullVersion = await res.json();

             // Validation: Check for blocks presence
             if (!fullVersion.blocks) {
                 setToast({ message: "This version does not include blocks; cannot load into draft.", type: 'error' });
                 setConfirmLoadVersion(false);
                 return;
             }

             const newDraft = deepClone(fullVersion);
             // Ensure blocks object
             if (!newDraft.blocks) newDraft.blocks = {};
             
             setDraftBundle(newDraft);
             
             setConfirmLoadVersion(false);
             setDraftError(null);
             setAckWarnings(false);
             setConfirmApply(false);
             
             // Select first block
             const keys = Object.keys(newDraft.blocks || {});
             if (keys.length > 0) {
                 handleDraftSelectBlock(keys[0], newDraft);
             } else {
                 setDraftSelectedBlockId(null);
             }
             
             setActiveTab('Draft');
         } catch (e: any) {
             setToast({ message: "Failed to load version: " + e.message, type: 'error' });
         }
    };

    if (!isOpen) return null;

    // definitions moved to top

    // Render Logic per Tab
    const renderContent = () => {
        const preStyle = {
            whiteSpace:'pre-wrap' as const, 
            wordBreak:'break-word' as const, 
            fontSize:'11px', 
            background:'#f4f4f4', 
            color: '#222', 
            padding:'10px',
            border: '1px solid #ddd'
        };
        
        const renderVersionsContent = () => (
            <div style={{padding:'20px', overflow:'auto', height:'100%'}}>
                {selectedVersionId ? (
                    // DETAIL VIEW
                    <div style={{display:'flex', flexDirection:'column', height:'100%'}}>
                            <div style={{marginBottom:'15px', display:'flex', alignItems:'center', gap:'15px'}}>
                                <button onClick={() => { setSelectedVersionId(null); setConfirmLoadVersion(false); setConfirmActivate(false); setActivateReason('Activated from Sysadmin'); setActivationMessage(null); }}>&larr; Back to List</button>
                                
                                {!versionDetailLoading && (
                                    confirmLoadVersion ? (
                                    <div style={{display:'flex', alignItems:'center', gap:'10px', background:'#fff3cd', padding:'5px 10px', borderRadius:'4px', border:'1px solid #ffeeba'}}>
                                        <span style={{color:'#856404', fontSize:'0.9em', fontWeight:'bold'}}>Replace local draft?</span>
                                        <button 
                                            onClick={handleLoadVersionToDraft} 
                                            style={{fontWeight:'bold', color:'#fff', background:'#dc3545', border:'none', borderRadius:'3px', padding:'2px 8px', cursor:'pointer'}}
                                        >
                                            Yes, Replace
                                        </button>
                                        <button 
                                            onClick={() => setConfirmLoadVersion(false)}
                                            style={{background:'#ffffff', color:'#111', border:'1px solid #ccc', borderRadius:'6px', padding:'6px 12px', cursor:'pointer', fontWeight: 600}}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                    ) : (
                                    <button 
                                        onClick={() => {
                                            if (draftBundle) setConfirmLoadVersion(true);
                                            else handleLoadVersionToDraft();
                                        }}
                                        style={{cursor:'pointer'}}
                                    >
                                        Load into Draft
                                    </button>
                                    )
                                )}

                                <h3 style={{margin:0}}>Version: {selectedVersionId}</h3>
                                {versionDetailLoading && <small>Loading...</small>}

                                {activationMessage && (
                                    <div style={{
                                        marginLeft:'auto', 
                                        padding:'6px 12px', 
                                        background:'#e8f5e9', 
                                        color:'#1b5e20', 
                                        border:'1px solid #c8e6c9', 
                                        borderRadius:'4px',
                                        fontWeight:'bold', 
                                        fontSize:'0.9em',
                                        display:'flex',
                                        alignItems:'center',
                                        gap:'8px'
                                    }}>
                                        <span>✓ {activationMessage}</span>
                                        <button 
                                            onClick={() => setActivationMessage(null)}
                                            style={{
                                                background:'none', border:'none', cursor:'pointer', 
                                                fontSize:'1.1em', fontWeight:'bold', color:'inherit', 
                                                lineHeight:1, padding:0, opacity:0.6
                                            }}
                                            title="Dismiss"
                                        >
                                            ×
                                        </button>
                                    </div>
                                )}

                                {/* Activate Button Logic */}
                                {shellVersions?.activeVersionId !== selectedVersionId && (
                                    <div style={{marginLeft: activationMessage ? '10px' : 'auto', display:'flex', alignItems:'center', gap:'10px'}}>
                                        {confirmActivate ? (
                                            <div style={{display:'flex', flexDirection:'column', gap:'10px', background:'#fff3e0', padding:'10px', borderRadius:'4px', border:'1px solid #ffe0b2', minWidth:'400px', maxWidth:'600px', zIndex: 100, position:'relative'}}>
                                                <div style={{fontWeight:'bold', borderBottom:'1px solid #ffd54f', paddingBottom:'5px', marginBottom:'5px', color:'#ef6c00'}}>Preflight Check</div>
                                                
                                                {preflightLoading && <div style={{color:'#666', fontStyle:'italic'}}>Running safety validation...</div>}
                                                {preflightError && <div style={{color:'red'}}>Error: {preflightError}</div>}
                                                
                                                {!preflightLoading && preflightResult && (
                                                    <>
                                                        {/* Result Summary */}
                                                        <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
                                                            <div style={{
                                                                fontWeight:'bold', 
                                                                color: preflightResult.canActivate ? (preflightResult.warnings.length > 0 ? '#ef6c00' : '#2e7d32') : '#d32f2f'
                                                            }}>
                                                                {preflightResult.canActivate 
                                                                    ? (preflightResult.warnings.length > 0 ? "ELIGIBLE WITH WARNINGS" : "SAFE TO ACTIVATE") 
                                                                    : "ACTIVATION BLOCKED"}
                                                            </div>
                                                        </div>

                                                        {/* Stats */}
                                                        {preflightResult.stats && (
                                                            <div style={{fontSize:'0.85em', color:'#555', display:'flex', gap:'10px'}}>
                                                                <span><span style={{color:'#2e7d32', fontWeight:'bold'}}>+</span> {preflightResult.stats.addedBlocks} Add</span>
                                                                <span><span style={{color:'#d32f2f', fontWeight:'bold'}}>-</span> {preflightResult.stats.removedBlocks} Del</span>
                                                                <span><span style={{color:'#ef6c00', fontWeight:'bold'}}>~</span> {preflightResult.stats.modifiedBlocks} Mod</span>
                                                            </div>
                                                        )}

                                                        {/* Errors List (Blocking) */}
                                                        {preflightResult.errors.length > 0 && (
                                                            <div style={{background:'#ffebee', padding:'5px', borderRadius:'3px', maxHeight:'100px', overflowY:'auto', border:'1px solid #ffcdd2'}}>
                                                                <strong style={{color:'#c62828', fontSize:'0.9em'}}>Blocking Issues:</strong>
                                                                <ul style={{margin:'2px 0 0 0', paddingLeft:'20px', color:'#c62828', fontSize:'0.85em'}}>
                                                                    {preflightResult.errors.map((e:any,i:number) => {
                                                                        const key = (typeof e === 'object' && e?.code) ? `${e.code}-${i}` : `${i}`;
                                                                        const msg = (typeof e === 'object' && e?.message) ? `${e.code || 'ERR'}: ${e.message} ${e.path ? `(${e.path})` : ''}` : e;
                                                                        return <li key={key}>{msg}</li>;
                                                                    })}
                                                                </ul>
                                                            </div>
                                                        )}

                                                        {/* Warnings List (Ack Required) */}
                                                        {preflightResult.warnings.length > 0 && (
                                                            <div style={{background:'#fff8e1', padding:'5px', borderRadius:'3px', maxHeight:'100px', overflowY:'auto', border:'1px solid #ffe0b2'}}>
                                                                <strong style={{color:'#f57c00', fontSize:'0.9em'}}>Warnings:</strong>
                                                                <ul style={{margin:'2px 0 0 0', paddingLeft:'20px', color:'#f57c00', fontSize:'0.85em'}}>
                                                                    {preflightResult.warnings.map((w:any,i:number) => {
                                                                        const key = (typeof w === 'object' && w?.code) ? `${w.code}-${i}` : `${i}`;
                                                                        const msg = (typeof w === 'object' && w?.message) ? `${w.code || 'WARN'}: ${w.message} ${w.path ? `(${w.path})` : ''}` : w;
                                                                        return <li key={key}>{msg}</li>;
                                                                    })}
                                                                </ul>
                                                            </div>
                                                        )}
                                                    
                                                        {/* Acknowledgement Checkbox */}
                                                        {preflightResult.canActivate && preflightResult.warnings.length > 0 && (
                                                            <label style={{display:'flex', alignItems:'center', cursor:'pointer', fontSize:'0.9em', marginTop:'5px'}}>
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={ackPreflightWarnings} 
                                                                    onChange={e => setAckPreflightWarnings(e.target.checked)}
                                                                    style={{marginRight:'6px'}}
                                                                />
                                                                I acknowledge these warnings.
                                                            </label>
                                                        )}
                                                    </>
                                                )}

                                                <div style={{display:'flex', gap:'5px', marginTop:'5px'}}>
                                                    <input 
                                                        type="text" 
                                                        value={activateReason} 
                                                        onChange={e => setActivateReason(e.target.value)}
                                                        placeholder="Reason for activation..."
                                                        style={{border:'1px solid #ccc', padding:'6px 10px', flex:1, borderRadius:'4px'}}
                                                        disabled={!preflightResult?.canActivate} 
                                                    />
                                                    <button 
                                                        onClick={() => handleActivate(selectedVersionId)}
                                                        disabled={!preflightResult?.canActivate || (preflightResult?.warnings.length > 0 && !ackPreflightWarnings) || preflightLoading}
                                                        style={{
                                                            background: (!preflightResult?.canActivate || (preflightResult?.warnings.length > 0 && !ackPreflightWarnings) || preflightLoading) ? '#ccc' : '#d32f2f', 
                                                            color:'white', border:'none', padding:'6px 12px', borderRadius:'6px', cursor:'pointer', fontWeight:'bold'
                                                        }}
                                                    >
                                                        Confirm Activate
                                                    </button>
                                                    <button 
                                                        onClick={() => setConfirmActivate(false)}
                                                        style={{background:'#ffffff', color:'#111', border:'1px solid #ccc', padding:'6px 12px', borderRadius:'6px', cursor:'pointer', fontWeight: 600}}
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <button 
                                                onClick={() => { setConfirmActivate(true); fetchPreflight(selectedVersionId); setActivationMessage(null); }}
                                                style={{background:'#ef6c00', color:'white', border:'none', borderRadius:'6px', padding:'6px 12px', fontWeight:700, cursor:'pointer'}}
                                            >
                                                Activate (debug)
                                            </button>
                                        )}
                                    </div>
                                )}
                                {shellVersions?.activeVersionId === selectedVersionId && (
                                    <div style={{marginLeft: activationMessage ? '10px' : 'auto', display:'flex', alignItems:'center', gap:'10px'}}>
                                        <span style={{color:'green', fontWeight:'bold', border:'1px solid green', padding:'2px 8px', borderRadius:'4px'}}>ACTIVE</span>
                                        {selectedVersionDetail?.meta?.parentVersionId ? (
                                            <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                                                <button 
                                                    onClick={() => {
                                                        const pid = selectedVersionDetail.meta.parentVersionId;
                                                        setSelectedVersionId(pid);
                                                        setActivateReason("Rollback to previous version");
                                                        setConfirmActivate(true);
                                                        fetchPreflight(pid);
                                                    }}
                                                    title={`Rollback to ${selectedVersionDetail.meta.parentVersionId}`}
                                                    style={{fontSize:'0.85em', cursor:'pointer', padding:'4px 8px', background:'#f5f5f5', border:'1px solid #ddd', borderRadius:'4px', color:'#333'}}
                                                >
                                                    ↺ Activate previous version
                                                </button>
                                                
                                                {/* Rollback Preview */}
                                                {(() => {
                                                    const pid = selectedVersionDetail.meta.parentVersionId;
                                                    const target = shellVersions?.versions?.find((v:any) => v.versionId === pid);
                                                    if (!target) return null;
                                                    
                                                    return (
                                                        <div style={{
                                                            fontSize:'0.75em', 
                                                            color:'#666', 
                                                            borderLeft:'2px solid #ddd', 
                                                            paddingLeft:'8px',
                                                            lineHeight:'1.2'
                                                        }}>
                                                            <div style={{fontWeight:'bold'}}>Rollback target: {pid.substring(0,8)}...</div>
                                                            <div style={{maxWidth:'200px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
                                                                {target.meta?.reason || target.meta?.description || '(no description)'}
                                                            </div>
                                                            <div style={{fontSize:'0.9em', color:'#999'}}>
                                                                {target.meta?.timestamp ? new Date(target.meta.timestamp).toLocaleDateString() + ' ' + new Date(target.meta.timestamp).toLocaleTimeString() : ''}
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        ) : (
                                            <span style={{fontSize:'0.8em', color:'#999', fontStyle:'italic'}}>(No previous version)</span>
                                        )}
                                    </div>
                                )}
                            </div>
                            
                            {versionDetailError ? (
                                <div style={{color:'red', border:'1px solid red', padding:'10px'}}>{versionDetailError}</div>
                            ) : selectedVersionDetail ? (
                                <div style={{flex:1, display:'flex', flexDirection:'column', gap:'15px'}}>
                                    {/* Summary Chips */}
                                    <div style={{display:'flex', gap:'10px', flexWrap:'wrap'}}>
                                        <div style={{background:'#eee', padding:'5px 10px', borderRadius:'4px', fontSize:'0.9em'}}>
                                            <strong>Author:</strong> {selectedVersionDetail.meta?.author || 'N/A'}
                                        </div>
                                        <div style={{background:'#eee', padding:'5px 10px', borderRadius:'4px', fontSize:'0.9em'}}>
                                            <strong>Timestamp:</strong> {selectedVersionDetail.meta?.timestamp || 'N/A'}
                                        </div>
                                        <div style={{background:'#eee', padding:'5px 10px', borderRadius:'4px', fontSize:'0.9em'}}>
                                            <strong>Mode:</strong> {selectedVersionDetail.meta?.mode || 'N/A'}
                                        </div>
                                        {shellVersions?.activeVersionId === selectedVersionId && shellVersions?.activeMeta?.reason && (
                                            <div style={{background:'#e8f5e9', padding:'5px 10px', borderRadius:'4px', fontSize:'0.9em', border:'1px solid #c8e6c9', color:'#1b5e20'}}>
                                                <strong>Active Reason:</strong> {shellVersions.activeMeta.reason}
                                            </div>
                                        )}
                                    </div>

                                    {/* Stats */}
                                    <div style={{display:'flex', gap:'15px', padding:'15px', background:'#f9f9f9', border:'1px solid #ddd'}}>
                                        <div style={{textAlign:'center'}}>
                                            <div style={{fontSize:'1.5em', fontWeight:'bold'}}>{selectedVersionDetail.stats?.blockCount}</div>
                                            <div style={{fontSize:'0.8em', color:'#666', textTransform:'uppercase'}}>Blocks</div>
                                        </div>
                                        <div style={{textAlign:'center'}}>
                                            <div style={{fontSize:'1.5em', fontWeight:'bold'}}>{selectedVersionDetail.stats?.bindingCount}</div>
                                            <div style={{fontSize:'0.8em', color:'#666', textTransform:'uppercase'}}>Bindings</div>
                                        </div>
                                        <div style={{textAlign:'center'}}>
                                            <div style={{fontSize:'1.5em', fontWeight:'bold'}}>{selectedVersionDetail.stats?.integrationCount}</div>
                                            <div style={{fontSize:'0.8em', color:'#666', textTransform:'uppercase'}}>Integrations</div>
                                        </div>
                                    </div>

                                    {/* Change Summary (Roadmap #4.4) */}
                                    <div style={{marginTop:'10px', padding:'10px', background:'#fff', border:'1px solid #ddd', borderLeft:'3px solid #007acc'}}>
                                    <div style={{fontWeight:'bold', color:'#333', marginBottom:'5px', fontSize:'0.9em'}}>
                                        Change Summary vs Parent {selectedVersionDetail.meta?.parentVersionId ? `(${selectedVersionDetail.meta.parentVersionId})` : ''}
                                    </div>
                                    
                                    {!selectedVersionDetail.meta?.parentVersionId ? (
                                        <div style={{fontStyle:'italic', color:'#666', fontSize:'0.85em'}}>No parent recorded (First version or imported).</div>
                                    ) : versionDiffLoading ? (
                                        <div style={{color:'#666', fontSize:'0.85em'}}>Computing diff...</div>
                                    ) : versionDiffError ? (
                                        <div style={{color:'#d32f2f', fontSize:'0.85em'}}>{versionDiffError}</div>
                                    ) : versionDiff ? (
                                        <div style={{display:'flex', gap:'15px', fontSize:'0.9em'}}>
                                                <span style={{color:'#2e7d32', fontWeight:'bold'}}>+ {versionDiff.added} Added</span>
                                                <span style={{color:'#c62828', fontWeight:'bold'}}>- {versionDiff.removed} Removed</span>
                                                <span style={{color:'#ef6c00', fontWeight:'bold'}}>~ {versionDiff.modified} Modified</span>
                                                <span style={{color: versionDiff.manifestChanged ? '#d32f2f' : '#666'}}>
                                                    Manifest: <strong>{versionDiff.manifestChanged ? 'CHANGED' : 'Unchanged'}</strong>
                                                </span>
                                        </div>
                                    ) : null}
                                    </div>
                                    
                                    {/* Manifest & Actions */}
                                    <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden', border:'1px solid #ddd'}}>
                                        <div style={{background:'#eee', padding:'8px', borderBottom:'1px solid #ddd', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                            <strong>Manifest & Metadata</strong>
                                            <CopyBtn k="verDetail" text={selectedVersionDetail} label="Copy Full JSON" />
                                        </div>
                                        <div style={{flex:1, overflow:'auto', padding:'0'}}>
                                            <pre style={{margin:0, padding:'10px', fontFamily:'monospace', fontSize:'0.85em'}}>
                                                {JSON.stringify({ 
                                                    manifest: selectedVersionDetail.manifest,
                                                    meta: selectedVersionDetail.meta 
                                                }, null, 2)}
                                            </pre>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                !versionDetailLoading && <div>No data loaded.</div>
                            )}
                    </div>
                ) : (
                    // LIST VIEW
                    <div style={{height:'100%', display:'flex', flexDirection:'column'}}>
                        <div style={{paddingBottom:'10px', borderBottom:'1px solid #eee', marginBottom:'10px'}}>
                            <h3 style={{margin:'0 0 5px 0'}}>Version History</h3>
                            <p style={{margin:0, fontSize:'0.9em', color:'#666'}}>
                                Active: <strong>{shellVersions?.activeVersionId || '...'}</strong> ({shellVersions?.activeMeta?.timestamp || '-'})
                            </p>
                            {activationMessage && (
                                    <div style={{marginTop:'5px', padding:'5px', background:'#e8f5e9', color:'#1b5e20', border:'1px solid #c8e6c9', borderRadius:'4px'}}>
                                        {activationMessage}
                                    </div>
                            )}
                            {shellVersionsError && <div style={{color:'red', marginTop:'5px'}}>{shellVersionsError}</div>}
                        </div>
                        
                        <div style={{flex:1, overflow:'auto'}}>
                            <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.9em'}}>
                                <thead style={{background:'#eee', position:'sticky', top:0}}>
                                    <tr>
                                        <th style={{padding:'8px', textAlign:'left', borderBottom:'1px solid #ccc'}}>Version ID</th>
                                        <th style={{padding:'8px', textAlign:'left', borderBottom:'1px solid #ccc'}}>Integrity</th>
                                        <th style={{padding:'8px', textAlign:'left', borderBottom:'1px solid #ccc'}}>Timestamp</th>
                                        <th style={{padding:'8px', textAlign:'left', borderBottom:'1px solid #ccc'}}>Description</th>
                                        <th style={{padding:'8px', textAlign:'left', borderBottom:'1px solid #ccc'}}>Mode</th>
                                        <th style={{padding:'8px', textAlign:'right', borderBottom:'1px solid #ccc'}}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {shellVersions?.versions?.map((v: any, i: number) => {
                                            const isActive = v.versionId === shellVersions.activeVersionId;
                                            const activeReason = isActive ? shellVersions.activeMeta?.reason : null;
                                            
                                            return (
                                            <tr key={v.versionId || i} style={{background: isActive ? '#f0f8ff' : 'white', borderBottom:'1px solid #eee'}}>
                                                <td style={{padding:'8px'}}>
                                                    <div style={{fontWeight:'bold'}}>{v.versionId}</div>
                                                    {isActive && <span style={{fontSize:'0.75em', color:'green', border:'1px solid green', borderRadius:'3px', padding:'0 2px'}}>ACTIVE</span>}
                                                </td>
                                                <td style={{padding:'8px', whiteSpace:'nowrap'}}>
                                                    {/* INTEGRITY BADGES */}
                                                    <div style={{display:'flex', gap:'4px', marginBottom: '2px'}}>
                                                        <span title="Metadata exists" style={{
                                                            fontSize:'0.7em', padding:'1px 4px', borderRadius:'3px', fontWeight:'bold',
                                                            color: v.hasMeta ? 'white' : '#666',
                                                            background: v.hasMeta ? '#2e7d32' : '#e0e0e0',
                                                            border: v.hasMeta ? 'none' : '1px solid #999'
                                                        }}>
                                                            META
                                                        </span>
                                                        <span title="Manifest exists" style={{
                                                            fontSize:'0.7em', padding:'1px 4px', borderRadius:'3px', fontWeight:'bold',
                                                            color: v.hasManifest ? 'white' : '#666',
                                                            background: v.hasManifest ? '#2e7d32' : '#e0e0e0',
                                                            border: v.hasManifest ? 'none' : '1px solid #999'
                                                        }}>
                                                            MANI
                                                        </span>
                                                        <span title="Activatable" style={{
                                                            fontSize:'0.7em', padding:'1px 4px', borderRadius:'3px', fontWeight:'bold',
                                                            color: v.isActivatable ? '#2e7d32' : '#616161',
                                                            background: v.isActivatable ? '#e8f5e9' : '#f5f5f5',
                                                            border: v.isActivatable ? '1px solid #2e7d32' : '1px solid #ccc'
                                                        }}>
                                                            ACT
                                                        </span>
                                                    </div>
                                                    <div style={{fontSize:'0.75em', color:'#555'}}>Blocks: {v.blockFileCount ?? '?'}</div>
                                                </td>
                                                <td style={{padding:'8px'}}>{v.timestamp}</td>
                                                <td style={{padding:'8px'}}>
                                                    <div>{v.description}</div>
                                                    {activeReason && <div style={{fontSize:'0.85em', color:'#2e7d32', marginTop:'2px'}}>Reason: {activeReason}</div>}
                                                </td>
                                                <td style={{padding:'8px'}}>{v.mode}</td>
                                                <td style={{padding:'8px', textAlign:'right'}}>
                                                    <button 
                                                        onClick={() => { setSelectedVersionId(v.versionId); fetchVersionDetail(v.versionId); setActivationMessage(null); }}
                                                        style={{cursor:'pointer'}}
                                                    >
                                                        View
                                                    </button>
                                                </td>
                                            </tr>
                                            );
                                    })}
                                    {(!shellVersions?.versions || shellVersions.versions.length === 0) && (
                                        <tr><td colSpan={6} style={{padding:'20px', textAlign:'center', color:'#888'}}>No versions found.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        );
        
        if (activeTab === 'Versions') {
            return renderVersionsContent();
        }

           const renderSnapshotContent = () => {
               const runtimeOpenWindows = runtimePlan ? Object.values(runtimePlan.windows || {}) : [];
               const openWindowIds = runtimeOpenWindows.length > 0
                  ? runtimeOpenWindows.map(w => w.id)
                  : (Array.isArray(snapshotData?.openWindows) ? snapshotData.openWindows : []);

               return (
               <div style={{display:'flex', flexDirection:'column', height:'100%', gap:'10px'}}>
                 <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #eee', paddingBottom:'10px'}}>
                     <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                         <strong style={{fontSize:'1.1em'}}>Runtime Snapshot</strong>
                         <button onClick={refreshSnapshot} style={{cursor:'pointer', padding:'2px 8px', fontSize:'0.9em'}}>Refresh</button>
                         {snapshotLoading && <span style={{color:'#666', fontSize:'0.9em'}}>Loading...</span>}
                     </div>
                     {snapshotData && <CopyBtn k="snapshot" text={snapshotData} />}
                 </div>

                 {snapshotError ? (
                     <div style={{color:'red', padding:'20px'}}>
                         Error fetching snapshot: {snapshotError}
                     </div>
                 ) : !snapshotData ? (
                    <div style={{padding:'20px', color:'#666', fontStyle:'italic'}}>
                        {snapshotLoading ? 'Loading snapshot…' : 'No snapshot yet.'}
                    </div>
                 ) : (
                     <div style={{display:'flex', flexDirection:'column', gap:'15px'}}>
                         <div style={{padding:'10px', background:'#f8f9fa', borderRadius:'4px', border:'1px solid #ddd'}}>
                             <div style={{display:'grid', gridTemplateColumns:'auto 1fr', gap:'8px 20px', fontSize:'0.9em'}}>
                                 <strong style={{color:'#555'}}>Active Version:</strong>
                                 <span style={{fontFamily:'monospace'}}>{snapshotData.activeVersionId || 'N/A'}</span>

                                 <strong style={{color:'#555'}}>Snapshot Time:</strong>
                                 <span>{snapshotData.ts ? new Date(snapshotData.ts).toLocaleString() : 'N/A'}</span>

                                 <strong style={{color:'#555'}}>UI Open Windows:</strong>
                                 <span>
                                     {openWindowIds.length}
                                     <span style={{marginLeft:'6px', fontSize:'0.85em', color:'#777'}}>(client runtime)</span>
                                 </span>

                                 <strong style={{color:'#555'}}>Derived Patches:</strong>
                                <span>{snapshotData.derivedPatchesCount ?? 0}</span>

                                 <strong style={{color:'#555'}}>Last Derived Tick:</strong>
                                 <span>{snapshotData.lastDerivedTickTs ? new Date(snapshotData.lastDerivedTickTs).toLocaleString() : 'N/A'}</span>
                             </div>
                         </div>

                         <div>
                             <strong style={{display:'block', marginBottom:'5px', color:'#333'}}>Open Windows</strong>
                             {openWindowIds.length > 0 ? (
                                 <ul style={{margin:0, paddingLeft:'20px'}}>
                                     {openWindowIds.map((w, i) => (
                                         <li key={`${w}-${i}`} style={{fontFamily:'monospace'}}>{w}</li>
                                     ))}
                                 </ul>
                             ) : (
                                 <div style={{fontStyle:'italic', color:'#666'}}>No open windows reported.</div>
                             )}
                         </div>
                                 {snapshotData.blocks?.byType && (
                            <div style={{marginTop:'15px'}}>
                                <strong style={{display:'block', marginBottom:'5px', color:'#333'}}>Blocks by Type</strong>
                                <div style={{maxHeight:'200px', overflowY:'auto', border:'1px solid #eee'}}>
                                    <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.9em'}}>
                                        <thead style={{background:'#f5f5f5', position:'sticky', top:0}}>
                                            <tr>
                                                <th style={{padding:'6px', textAlign:'left', borderBottom:'1px solid #ddd'}}>Type</th>
                                                <th style={{padding:'6px', textAlign:'left', borderBottom:'1px solid #ddd'}}>Count</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                        {Object.entries(snapshotData.blocks.byType)
                                            .sort(([,a], [,b]) => b - a)
                                            .map(([type, count]) => (
                                                <tr key={type} style={{borderBottom:'1px solid #eee'}}>
                                                    <td style={{padding:'6px', fontFamily:'monospace', color:'#333'}}>{type}</td>
                                                    <td style={{padding:'6px', fontWeight:'bold'}}>{count}</td>
                                                </tr>
                                            ))
                                        }
                                        {Object.keys(snapshotData.blocks.byType).length === 0 && (
                                            <tr><td colSpan={2} style={{padding:'10px', color:'#999', fontStyle:'italic'}}>No blocks found.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            </div>
                        )}

                         {/* Integrations Breakdown (Roadmap #5.1) */}
                        {snapshotData.integrations && (
                        <div style={{marginTop:'15px'}}>
                             <strong style={{display:'block', marginBottom:'5px', color:'#333'}}>Integrations</strong>
                             <div style={{marginBottom:'5px', fontSize:'0.9em'}}>
                                 Total: <strong>{snapshotData.integrations.total ?? 0}</strong>
                             </div>
                             {(snapshotData.integrations.total ?? 0) > 0 && (
                                 <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.9em', border:'1px solid #eee'}}>
                                     <thead>
                                         <tr style={{background:'#f5f5f5', textAlign:'left'}}>
                                             <th style={{padding:'6px', borderBottom:'1px solid #ddd'}}>Type</th>
                                             <th style={{padding:'6px', borderBottom:'1px solid #ddd', width:'80px'}}>Count</th>
                                             <th style={{padding:'6px', borderBottom:'1px solid #ddd'}}>Capabilities {adapterCapsLoading && <span style={{fontSize:'0.8em', color:'#666'}}>(loading...)</span>}</th>
                                         </tr>
                                     </thead>
                                     <tbody>
                                         {snapshotData.integrations.byType && Object.entries(snapshotData.integrations.byType)
                                             .sort(([,a], [,b]) => (b as number) - (a as number))
                                             .map(([type, count]) => {
                                                 const cap = adapterCaps[type];
                                                 const badgeStyle = { fontSize:'0.75em', padding:'1px 5px', borderRadius:'3px', marginRight:'4px', fontWeight:'bold' };
                                                 const green = { ...badgeStyle, background:'#e8f5e9', color:'#1b5e20', border:'1px solid #c8e6c9' };
                                                 const gray = { ...badgeStyle, background:'#f5f5f5', color:'#777', border:'1px solid #ddd' };
                                                 
                                                 return (
                                                     <tr key={type} style={{borderBottom:'1px solid #eee'}}>
                                                         <td style={{padding:'6px', fontFamily:'monospace', color:'#333'}}>{type}</td>
                                                         <td style={{padding:'6px', fontWeight:'bold'}}>{count as number}</td>
                                                         <td style={{padding:'6px'}}>
                                                             {!cap ? (
                                                                 <span style={{color: adapterCapsError ? '#d32f2f' : '#888', fontStyle:'italic', fontSize:'0.85em'}}>
                                                                     {adapterCapsError ? 'Error loading adapters' : 'NO ADAPTER'}
                                                                 </span>
                                                             ) : (
                                                                 <div style={{display:'flex', gap:'2px'}}>
                                                                     <span style={cap.execute ? green : gray}>EXEC</span>
                                                                     <span style={cap.dryRun ? green : gray}>DRY</span>
                                                                     <span style={cap.productionSafe ? green : gray}>SAFE</span>
                                                                     {cap.requiresSecrets && <span style={{...badgeStyle, background:'#fff3e0', color:'#e65100', border:'1px solid #ffe0b2'}}>SECRETS</span>}
                                                                 </div>
                                                             )}
                                                         </td>
                                                     </tr>
                                                 );
                                             })
                                         }
                                     </tbody>
                                 </table>
                             )}
                             
                             {/* Warning for HTTP */}
                                {snapshotData.integrations.byType && Object.keys(snapshotData.integrations.byType).some(k => k.includes('shell.infra.api.http')) && (
                                 <div style={{marginTop:'5px', padding:'5px', background:'#fff3e0', border:'1px solid #ffe0b2', borderRadius:'3px', fontSize:'0.85em', color:'#e65100'}}>
                                      <strong>Note:</strong> HTTP integrations are not production-safe yet.
                                 </div>
                             )}
                            </div>
                            )}

                         {/* Integration Adapters (Available) - Roadmap #5.3.2 */}
                         <div style={{marginTop:'20px', borderTop:'1px solid #eee', paddingTop:'15px'}}>
                             <strong style={{display:'block', marginBottom:'10px', color:'#333'}}>Integration Adapters (Available)</strong>

                             {adapterCapsLoading && <div style={{color:'#666', fontStyle:'italic', fontSize:'0.9em'}}>Loading capabilities...</div>}
                             {adapterCapsError && <div style={{color:'#d32f2f', padding:'5px', border:'1px solid #ffcdd2', background:'#ffebee', borderRadius:'3px', fontSize:'0.9em'}}>Error: {adapterCapsError}</div>}

                             {!adapterCapsLoading && !adapterCapsError && (
                                <>
                                    {Object.keys(adapterCaps).length === 0 ? (
                                        <div style={{fontStyle:'italic', color:'#666', padding:'8px', background:'#f9f9f9', border:'1px solid #eee', fontSize:'0.9em'}}>No adapters registered.</div>
                                    ) : (
                                        <div>
                                            <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.85em', border:'1px solid #eee'}}>
                                                <thead>
                                                    <tr style={{background:'#f5f5f5', textAlign:'left'}}>
                                                        <th style={{padding:'6px', borderBottom:'1px solid #ddd'}}>Type</th>
                                                        <th style={{padding:'6px', borderBottom:'1px solid #ddd', textAlign:'center'}}>EXEC</th>
                                                        <th style={{padding:'6px', borderBottom:'1px solid #ddd', textAlign:'center'}}>DRY</th>
                                                        <th style={{padding:'6px', borderBottom:'1px solid #ddd', textAlign:'center'}}>PROD SAFE</th>
                                                        <th style={{padding:'6px', borderBottom:'1px solid #ddd', textAlign:'center'}}>SECRETS</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {Object.entries(adapterCaps)
                                                        .sort(([typeA], [typeB]) => typeA.localeCompare(typeB))
                                                        .map(([type, cap]) => {
                                                            const pillBase = { display:'inline-block', padding:'2px 6px', borderRadius:'10px', fontSize:'0.85em', fontWeight:'bold' };
                                                            const pillGreen = { ...pillBase, background:'#e8f5e9', color:'#2e7d32', border:'1px solid #c8e6c9' };
                                                            const pillGray = { ...pillBase, background:'#f5f5f5', color:'#9e9e9e', border:'1px solid #e0e0e0' };
                                                            
                                                            return (
                                                                <tr key={type} style={{borderBottom:'1px solid #eee'}}>
                                                                    <td style={{padding:'6px', fontFamily:'monospace', color:'#333'}}>{type}</td>
                                                                    <td style={{padding:'6px', textAlign:'center'}}>
                                                                         <span style={cap.execute ? pillGreen : pillGray}>{cap.execute ? 'YES' : 'NO'}</span>
                                                                    </td>
                                                                    <td style={{padding:'6px', textAlign:'center'}}>
                                                                         <span style={cap.dryRun ? pillGreen : pillGray}>{cap.dryRun ? 'YES' : 'NO'}</span>
                                                                    </td>
                                                                    <td style={{padding:'6px', textAlign:'center'}}>
                                                                         <span style={cap.productionSafe ? pillGreen : pillGray}>{cap.productionSafe ? 'YES' : 'NO'}</span>
                                                                    </td>
                                                                    <td style={{padding:'6px', textAlign:'center'}}>
                                                                         {cap.requiresSecrets ? 
                                                                             <span style={{...pillBase, background:'#fff3e0', color:'#e65100', border:'1px solid #ffe0b2'}}>REQ</span> : 
                                                                             <span style={{color:'#ccc'}}>-</span>}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                </tbody>
                                            </table>
                                            
                                            {Object.values(adapterCaps).some(c => !c.productionSafe) && (
                                                <div style={{marginTop:'8px', padding:'6px', background:'#fff3e0', borderLeft:'3px solid #ff9800', fontSize:'0.85em', color:'#e65100'}}>
                                                     <strong>Note:</strong> Some adapters are not production-safe yet.
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                             )}
                         </div>
                     </div>
                 )}
             </div>
        );
        };

        const renderKnownPanel = (blockType: string) => {
            if (blockType === 'sysadmin.panel.snapshot') {
                if (!snapshotData && !snapshotLoading && !snapshotError) {
                    setTimeout(() => refreshSnapshot(), 0); 
                }
                return renderSnapshotContent();
            }
            if (blockType === 'sysadmin.panel.versions') {
                 if (!shellVersions && !shellVersionsError) {
                      setTimeout(() => refreshVersions(), 0);
                 }
                 return renderVersionsContent();
            }
            return null;
        };

        switch(activeTab) {

            case 'Node Editor (Button)': {
                 // Ensure graph is loaded
                 if (!resolvedGraph && !resolvedGraphLoading && !resolvedGraphError) {
                     setTimeout(() => refreshResolvedGraph(), 0);
                 }

                 if (resolvedGraphLoading) return <div style={{padding:'20px'}}>Loading graph...</div>;
                 if (resolvedGraphError) return <div style={{padding:'20px', color:'red'}}>Error: {resolvedGraphError}</div>;
                 if (!resolvedGraph) return <div style={{padding:'20px'}}>No graph data.</div>;

                 // Handle Schema Loading
                 if (buttonSchemaLoading) return <div style={{padding:'20px'}}>Loading Schema...</div>;
                 if (!buttonSchema) return <div style={{padding:'20px'}}>Waiting for schema...</div>;

                 // Filter Button Nodes (scan nodesById)
                 const nodes = resolvedGraph.nodesById || {};
                 const buttonNodes = Object.values(nodes).filter((n: any) => n.type === 'ui.node.button');
                 
                 const selectedNode = nodeEditorSelectedId ? getEffectiveNode(nodeEditorSelectedId) : null;
                 const bundleForUi = bundleData; // Alias for UI logic below
                    const activeBlocks = (bundleData as any)?.blocks || {};
                    const draftBlocks = (draftBundle as any)?.blocks || {};
                    const activeNodeBlock = selectedNode ? findBlockById(activeBlocks, selectedNode.id) : null;
                    const draftNodeBlock = selectedNode ? findBlockById(draftBlocks, selectedNode.id) : null;
                    const baseNodeData = (activeNodeBlock?.data || {}) as any;
                    const draftNodeData = (draftNodeBlock?.data || {}) as any;
                    const composedNodeData = deepMerge(baseNodeData, draftNodeData);
                      const templateBlocks = (Object.values((bundleData as any)?.blocks || {}) as any[])
                          .filter((b: any) => b?.blockType === 'template' && b?.data?.targetBlockType === 'ui.node.button');
                      const selectedTemplateBlock = nodeTemplateId
                          ? templateBlocks.find((b: any) => (b.blockId || b.id) === nodeTemplateId)
                          : null;
                      const templateDefaults = selectedTemplateBlock?.data?.defaults || {};
                      const variantOptions = buttonSchema?.properties?.variant?.enum || ['primary', 'secondary', 'ghost', 'dangerous'];
                    const overridesOnly = { ...(draftNodeData || {}) } as any;
                    delete overridesOnly.inheritFrom;
                    const overridesWithToggles = nodeTemplateId
                       ? buttonOverrideFields.reduce((acc: any, path: string) => {
                           if (nodeOverrideFlags[path]) {
                               return setValueByPath(acc, path, nodeEditorForm[path]);
                           }
                           return acc;
                       }, {})
                       : overridesOnly;
                    const composedWithTemplateDefaults = nodeTemplateId
                       ? applyTemplateDefaultsForFields(composedNodeData, templateDefaults, buttonOverrideFields)
                       : composedNodeData;
                    const effectivePreview = nodeTemplateId
                       ? deepMerge(composedWithTemplateDefaults, overridesWithToggles)
                       : composedNodeData;

                 return (
                     <div style={{display:'flex', height:'100%'}}>
                         <div style={{width:'250px', borderRight:'1px solid #ddd', overflowY:'auto', padding:'10px', background:'#fafafa'}}>
                             <div style={{fontWeight:'bold', marginBottom:'10px', color:'#333'}}>Buttons ({buttonNodes.length})</div>
                             {buttonNodes.length === 0 && <div style={{fontStyle:'italic', color:'#666'}}>No buttons found in active graph.</div>}
                             {buttonNodes.map((n:any) => {
                                 const isDraft = !!(bundleForUi as any)?.blocks?.[n.id];
                                 return (
                                     <div 
                                        key={n.id} 
                                        onClick={() => handleNodeSelect(n.id)}
                                        style={{
                                            padding:'8px', cursor:'pointer', 
                                            background: nodeEditorSelectedId === n.id ? '#e3f2fd' : 'white',
                                            borderBottom:'1px solid #eee',
                                            borderRadius:'4px',
                                            marginBottom:'2px',
                                            border: nodeEditorSelectedId === n.id ? '1px solid #90caf9' : '1px solid transparent'
                                        }}
                                     >
                                         <div style={{fontWeight:'bold', fontSize:'0.9em'}}>{n.props?.label || n.label || '(No Label)'}</div>
                                         <div style={{fontSize:'0.8em', color:'#666', fontFamily:'monospace'}}>{n.id}</div>
                                         {isDraft && <span style={{fontSize:'0.7em', background:'#e8f5e9', color:'green', padding:'1px 4px', borderRadius:'3px', border:'1px solid #c8e6c9', fontWeight:'bold'}}>DRAFT</span>}
                                     </div>
                                 );
                             })}
                         </div>
                         
                         <div style={{flex:1, padding:'20px', overflowY:'auto'}}>
                             {selectedNode ? (
                                 <div style={{maxWidth:'600px'}}>
                                     <div style={{marginBottom:'20px', borderBottom:'1px solid #eee', paddingBottom:'10px'}}>
                                         <div style={{fontSize:'1.4em', fontWeight:'bold', color:'#333'}}>{selectedNode.props?.label || selectedNode.label || selectedNode.id}</div>
                                         <div style={{fontSize:'0.8em', color:'#2e7d32', background:'#e8f5e9', padding:'4px', borderRadius:'3px', border:'1px solid #c8e6c9', marginTop:'5px'}}>
                                            Schema-Driven Form: Fetched from backend. Rendering {schemaFields.length} properties.
                                         </div>
                                         <div style={{display:'flex', gap:'10px', alignItems:'center', marginTop:'5px'}}>
                                             <div style={{color:'#666', fontSize:'0.9em', fontFamily:'monospace', background:'#f5f5f5', padding:'2px 6px', borderRadius:'4px'}}>
                                                 ID: {selectedNode.id}
                                             </div>
                                             <div style={{
                                                 fontSize:'0.8em', fontWeight:'bold', 
                                                 color: selectedNode._source === 'DRAFT' ? '#2e7d32' : '#0277bd',
                                                 background: selectedNode._source === 'DRAFT' ? '#e8f5e9' : '#e1f5fe',
                                                 padding:'2px 8px', borderRadius:'10px',
                                                 border: selectedNode._source === 'DRAFT' ? '1px solid #c8e6c9' : '1px solid #b3e5fc'
                                             }}>
                                                 SOURCE: {selectedNode._source}
                                             </div>
                                             {snapshotData?.activeVersionId && (
                                                <div style={{fontSize:'0.8em', color:'#666', background:'#f5f5f5', padding:'2px 6px', borderRadius:'4px'}}>
                                                    Active: <strong>{snapshotData.activeVersionId}</strong>
                                                </div>
                                             )}
                                         </div>
                                     </div>
                                     
                                     <div style={{background:'white', padding:'20px', border:'1px solid #ddd', borderRadius:'8px', boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>

                                         <div style={{marginBottom:'16px', padding:'12px', border:'1px solid #eee', borderRadius:'6px', background:'#fafafa'}}>
                                             <div style={{fontWeight:'bold', marginBottom:'8px'}}>Template</div>
                                             <div style={{display:'flex', gap:'10px', alignItems:'center', marginBottom:'8px'}}>
                                                 <select
                                                     value={nodeTemplateId || ''}
                                                     onChange={(e) => {
                                                         const next = e.target.value || null;
                                                         setNodeTemplateId(next);
                                                         setNodeEditorDirty(true);
                                                     }}
                                                     style={{padding:'6px 8px', border:'1px solid #ccc', borderRadius:'4px', minWidth:'260px'}}
                                                 >
                                                     <option value="">(None)</option>
                                                     {templateBlocks.map((t: any) => (
                                                         <option key={t.blockId || t.id} value={t.blockId || t.id}>
                                                             {t.data?.templateName || t.data?.label || (t.blockId || t.id)}
                                                         </option>
                                                     ))}
                                                 </select>
                                                 <div style={{fontSize:'0.85em', color:'#666'}}>
                                                     {nodeTemplateId ? `Selected: ${nodeTemplateId}` : 'No template selected'}
                                                 </div>
                                             </div>
                                             <div style={{display:'flex', gap:'8px', alignItems:'center', marginBottom:'8px'}}>
                                                 <button
                                                     onClick={() => {
                                                         if (!selectedNode) return;
                                                         setSelectedBlockId(selectedNode.id);
                                                         setActiveTab('Blocks');
                                                     }}
                                                     style={{padding:'4px 8px', fontSize:'0.85em', cursor:'pointer'}}
                                                 >
                                                     Open Advanced JSON in Blocks tab
                                                 </button>
                                             </div>
                                             <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
                                                 {[
                                                     { path: 'label', label: 'Label', type: 'text' },
                                                     { path: 'variant', label: 'Variant', type: 'select' },
                                                     { path: 'icon', label: 'Icon', type: 'text' },
                                                     { path: 'helpText', label: 'Help Text', type: 'text' },
                                                     { path: 'requiredPermission', label: 'Required Permission', type: 'text' }
                                                 ].map(field => {
                                                     const overrideOn = !!nodeOverrideFlags[field.path];
                                                     const inheritedValue = getValueByPath(templateDefaults, field.path);
                                                     const effectiveValue = getValueByPath(effectivePreview, field.path);
                                                     const inputValue = overrideOn ? (nodeEditorForm[field.path] ?? '') : (inheritedValue ?? '');
                                                     const disableOverride = !nodeTemplateId;

                                                     return (
                                                         <div key={field.path} style={{display:'grid', gridTemplateColumns:'120px 1fr', gap:'10px', alignItems:'center'}}>
                                                             <div style={{fontWeight:'bold', fontSize:'0.85em', color:'#333'}}>{field.label}</div>
                                                             <div style={{display:'flex', flexDirection:'column', gap:'6px'}}>
                                                                 <label style={{display:'flex', alignItems:'center', gap:'8px', fontSize:'0.85em'}}>
                                                                     <input
                                                                         type="checkbox"
                                                                         checked={overrideOn}
                                                                         disabled={disableOverride}
                                                                         onChange={(e) => {
                                                                             const next = e.target.checked;
                                                                             setNodeOverrideFlags({ ...nodeOverrideFlags, [field.path]: next });
                                                                             if (next) {
                                                                                 setNodeEditorForm({ ...nodeEditorForm, [field.path]: effectiveValue ?? '' });
                                                                             } else {
                                                                                 setNodeEditorForm((prev: any) => {
                                                                                     const nextForm = { ...prev };
                                                                                     delete nextForm[field.path];
                                                                                     return nextForm;
                                                                                 });
                                                                             }
                                                                             setNodeEditorDirty(true);
                                                                         }}
                                                                     />
                                                                     Override
                                                                 </label>
                                                                 {field.type === 'select' ? (
                                                                     <select
                                                                         value={inputValue || ''}
                                                                         disabled={!overrideOn}
                                                                         onChange={(e) => {
                                                                             setNodeEditorForm({ ...nodeEditorForm, [field.path]: e.target.value });
                                                                             setNodeEditorDirty(true);
                                                                         }}
                                                                         style={{padding:'6px 8px', border:'1px solid #ccc', borderRadius:'4px'}}
                                                                     >
                                                                         <option value="">(Select)</option>
                                                                         {variantOptions.map((opt: string) => (
                                                                             <option key={opt} value={opt}>{opt}</option>
                                                                         ))}
                                                                     </select>
                                                                 ) : (
                                                                     <input
                                                                         type="text"
                                                                         value={inputValue || ''}
                                                                         disabled={!overrideOn}
                                                                         onChange={(e) => {
                                                                             setNodeEditorForm({ ...nodeEditorForm, [field.path]: e.target.value });
                                                                             setNodeEditorDirty(true);
                                                                         }}
                                                                         style={{padding:'6px 8px', border:'1px solid #ccc', borderRadius:'4px'}}
                                                                     />
                                                                 )}
                                                                 <div style={{fontSize:'0.75em', color:'#666'}}>
                                                                     Inherited: {String(inheritedValue || '') || '(none)'} | Effective: {String(effectiveValue || '') || '(none)'}
                                                                 </div>
                                                             </div>
                                                         </div>
                                                     );
                                                 })}
                                             </div>
                                         </div>
                                         
                                         {schemaFields.filter(f => !buttonOverrideFields.includes(f.path)).map(f => {
                                             let errorMsg = null;
                                             const val = nodeEditorForm[f.path];
                                             
                                             if (f.required && (val === undefined || val === null || val === '')) {
                                                 errorMsg = "Required";
                                             } else if (f.enumOptions && f.enumOptions.length > 0 && val && !f.enumOptions.includes(val)) {
                                                 errorMsg = 'Must be one of: ' + f.enumOptions.join(', ');
                                             }

                                             const isMulti = isMultilineField('ui.node.button', f.path);

                                             return (
                                             <div key={f.path} style={{marginBottom:'20px'}}>
                                                 {f.type === 'boolean' ? (
                                                     <div style={{display:'flex', alignItems:'center', gap:'10px', padding:'5px 0'}}>
                                                         <input 
                                                             type="checkbox" 
                                                             checked={!!nodeEditorForm[f.path]}
                                                             onChange={(e) => {
                                                                 setNodeEditorForm({...nodeEditorForm, [f.path]: e.target.checked});
                                                                 setNodeEditorDirty(true);
                                                             }}
                                                             style={{width:'20px', height:'20px', cursor:'pointer', accentColor:'#333'}} 
                                                         />
                                                         <label 
                                                            style={{fontWeight:'bold', color:'#333', cursor:'pointer', userSelect:'none'}} 
                                                            onClick={() => {
                                                                 setNodeEditorForm({...nodeEditorForm, [f.path]: !nodeEditorForm[f.path]});
                                                                 setNodeEditorDirty(true);
                                                            }}
                                                         >
                                                             {f.title} {f.required && <span style={{color:'#d32f2f'}}>*</span>}
                                                         </label>
                                                     </div>
                                                 ) : (
                                                     <>
                                                        <label style={{display:'block', fontWeight:'bold', marginBottom:'6px', color:'#333'}}>
                                                            {f.title} {f.required && <span style={{color:'#d32f2f'}}>*</span>}
                                                        </label>
                                                        {f.enumOptions && f.enumOptions.length > 0 ? (
                                                            <select
                                                                value={nodeEditorForm[f.path] || ''}
                                                                onChange={(e) => {
                                                                    setNodeEditorForm({...nodeEditorForm, [f.path]: e.target.value});
                                                                    setNodeEditorDirty(true);
                                                                }}
                                                                style={{
                                                                    width:'100%', padding:'10px', fontSize:'1em', 
                                                                    border: errorMsg ? '1px solid #d32f2f' : '1px solid #ccc', 
                                                                    borderRadius:'4px', boxSizing:'border-box', backgroundColor:'#333', color:'white'
                                                                }}
                                                            >
                                                                <option value="" style={{backgroundColor:'#333', color:'white'}}>(Select Option)</option>
                                                                {f.enumOptions.map(opt => (
                                                                    <option key={opt} value={opt} style={{backgroundColor:'#333', color:'white'}}>{opt}</option>
                                                                ))}
                                                            </select>
                                                        ) : (
                                                            isMulti ? (
                                                                <AutoGrowTextArea
                                                                    value={nodeEditorForm[f.path] || ''}
                                                                    onChange={(e: any) => {
                                                                        setNodeEditorForm({...nodeEditorForm, [f.path]: e.target.value});
                                                                        setNodeEditorDirty(true);
                                                                    }}
                                                                    style={{
                                                                        width:'100%', padding:'10px', fontSize:'1em', 
                                                                        border: errorMsg ? '1px solid #d32f2f' : '1px solid #ccc',
                                                                        borderRadius:'4px', boxSizing:'border-box'
                                                                    }}
                                                                    placeholder={'Enter ' + f.title + '...'}
                                                                />
                                                            ) : (
                                                                <input 
                                                                    type="text" 
                                                                    value={nodeEditorForm[f.path] || ''}
                                                                    onChange={(e) => {
                                                                        setNodeEditorForm({...nodeEditorForm, [f.path]: e.target.value});
                                                                        setNodeEditorDirty(true);
                                                                    }}
                                                                    style={{
                                                                        width:'100%', padding:'10px', fontSize:'1em', 
                                                                        border: errorMsg ? '1px solid #d32f2f' : '1px solid #ccc',
                                                                        borderRadius:'4px', boxSizing:'border-box'
                                                                    }}
                                                                    placeholder={'Enter ' + f.title + '...'}
                                                                />
                                                            )
                                                        )}
                                                     </>
                                                 )}
                                                 {errorMsg && (
                                                     <div style={{color:'#d32f2f', fontSize:'0.8em', marginTop:'2px', fontWeight:'bold'}}>
                                                         {errorMsg}
                                                     </div>
                                                 )}
                                                 <div style={{fontSize:'0.8em', color:'#888', marginTop:'4px'}}>
                                                    {f.description || ('Mapped to ' + f.path)}
                                                 </div>
                                             </div>
                                             );
                                         })}
                                         
                                        <div style={{display:'flex', gap:'15px', alignItems:'center', marginTop:'30px', paddingTop:'20px', borderTop:'1px solid #eee'}}>
                                             <button 
                                                 onClick={handleSaveNodeDraftVersion}
                                                 disabled={!nodeEditorDirty || nodeDraftSaving}
                                                 style={{
                                                     padding:'10px 20px', 
                                                     background: nodeEditorDirty ? '#007acc' : '#e0e0e0', 
                                                     color: nodeEditorDirty ? 'white' : '#888',
                                                     border:'none', borderRadius:'4px', cursor: (nodeEditorDirty && !nodeDraftSaving) ? 'pointer' : 'default', fontWeight:'bold',
                                                     boxShadow: nodeEditorDirty ? '0 2px 4px rgba(0,122,204,0.3)' : 'none',
                                                     transition: 'all 0.2s'
                                                 }}
                                             >
                                                 {nodeDraftSaving ? 'Saving Draft…' : (nodeEditorDirty ? 'Save Draft' : 'No Changes')}
                                             </button>
                                             
                                             {!bundleForUi && (
                                                <div style={{color:'#e65100', fontSize:'0.9em', background:'#fff3e0', padding:'8px', borderRadius:'4px', border:'1px solid #ffe0b2'}}>
                                                    <strong>Draft not started.</strong> Editing will initialize a new draft.
                                                </div>
                                             )}
                                             
                                             {/* Deployed Button inside Node Editor */}
                                             {bundleForUi && (
                                                <div style={{marginLeft:'auto', display:'flex', flexDirection:'column', alignItems:'flex-end'}}>
                                                {renderValidationSummary()}
                                                <button 
                                                    onClick={() => { if (lastDraftVersionId) setShowActivateDraftModal(true); }}
                                                    disabled={!lastDraftVersionId || nodeDraftSaving || activateDraftSaving}
                                                    style={{
                                                        padding:'10px 20px', fontSize:'1em', 
                                                        background: lastDraftVersionId ? '#e65100' : '#eee', 
                                                        color: lastDraftVersionId ? '#fff' : '#888', 
                                                        border:'1px solid #e65100', borderRadius:'4px', cursor: (!lastDraftVersionId || nodeDraftSaving || activateDraftSaving) ? 'not-allowed' : 'pointer',
                                                        fontWeight: 'bold'
                                                    }}
                                                    title={lastDraftVersionId ? "Activate saved draft version" : "Save a draft first"}
                                                >
                                                    {activateDraftSaving ? 'Activating…' : 'Activate Draft'}
                                                </button>

                                                </div>
                                             )}
                                         </div>
                                     </div>
                                 </div>
                             ) : (
                                 <div style={{height:'100%', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', color:'#ccc'}}>
                                     <div style={{fontSize:'3em', marginBottom:'10px'}}>🖱️</div>
                                     <div style={{fontSize:'1.2em'}}>Select a button from the list</div>
                                 </div>
                             )}
                         </div>
                     </div>
                 );
            }

            case 'Node Editor (Text)': {
                 // Ensure graph is loaded
                 if (!resolvedGraph && !resolvedGraphLoading && !resolvedGraphError) {
                     setTimeout(() => refreshResolvedGraph(), 0);
                 }

                 if (resolvedGraphLoading) return <div style={{padding:'20px'}}>Loading graph...</div>;
                 if (resolvedGraphError) return <div style={{padding:'20px', color:'red'}}>Error: {resolvedGraphError}</div>;
                 if (!resolvedGraph) return <div style={{padding:'20px'}}>No graph data.</div>;

                 // Handle Schema Loading
                 if (textSchemaLoading) return <div style={{padding:'20px'}}>Loading Schema...</div>;
                 if (!textSchema) return <div style={{padding:'20px'}}>Waiting for schema...</div>;

                 // Filter Text Nodes
                 const nodes = resolvedGraph.nodesById || {};
                 const textNodes = Object.values(nodes).filter((n: any) => n.type === 'ui.node.text');
                 
                 const selectedNode = nodeEditorSelectedId ? getEffectiveNode(nodeEditorSelectedId) : null;
                 const draftBundle = bundleData; 

                 return (
                     <div style={{display:'flex', height:'100%'}}>
                         <div style={{width:'250px', borderRight:'1px solid #ddd', overflowY:'auto', padding:'10px', background:'#fafafa'}}>
                             <div style={{fontWeight:'bold', marginBottom:'10px', color:'#333'}}>Text Nodes ({textNodes.length})</div>
                             {textNodes.length === 0 && <div style={{fontStyle:'italic', color:'#666'}}>No text nodes found in active graph.</div>}
                             {textNodes.map((n:any) => {
                                 const isDraft = !!(draftBundle as any)?.blocks?.[n.id];
                                 const displayText = n.props?.content || n.props?.text || n.label || n.id;
                                 const truncate = (s:string) => s && s.length > 30 ? s.substring(0,30)+'...' : s;
                                 
                                 return (
                                     <div 
                                        key={n.id} 
                                        onClick={() => handleNodeSelect(n.id)}
                                        style={{
                                            padding:'8px', cursor:'pointer', 
                                            background: nodeEditorSelectedId === n.id ? '#e3f2fd' : 'white',
                                            borderBottom:'1px solid #eee',
                                            borderRadius:'4px',
                                            marginBottom:'2px',
                                            border: nodeEditorSelectedId === n.id ? '1px solid #90caf9' : '1px solid transparent'
                                        }}
                                     >
                                         <div style={{fontWeight:'bold', fontSize:'0.9em'}}>{truncate(displayText)}</div>
                                         <div style={{fontSize:'0.8em', color:'#666', fontFamily:'monospace'}}>{n.id}</div>
                                         {isDraft && <span style={{fontSize:'0.7em', background:'#e8f5e9', color:'green', padding:'1px 4px', borderRadius:'3px', border:'1px solid #c8e6c9', fontWeight:'bold'}}>DRAFT</span>}
                                     </div>
                                 );
                             })}
                         </div>
                         
                         <div style={{flex:1, padding:'20px', overflowY:'auto'}}>
                             {selectedNode ? (
                                 <div style={{maxWidth:'600px'}}>
                                     <div style={{borderBottom:'1px solid #ddd', paddingBottom:'10px', marginBottom:'20px'}}>
                                         <h3>Editing: {selectedNode.id}</h3>
                                         {snapshotData?.activeVersionId && <div style={{color:'#666', fontSize:'0.9em', marginTop:'2px'}}>Active Version: <strong>{snapshotData.activeVersionId}</strong></div>}
                                         <div style={{color:'#666'}}>Type: {selectedNode.type}</div>
                                         {selectedNode._source === 'ACTIVE' && <div style={{color:'#f57f17', fontSize:'0.9em', marginTop:'5px'}}>Editing Active Node (Will create Draft)</div>}
                                         {selectedNode._source === 'DRAFT' && <div style={{color:'green', fontSize:'0.9em', marginTop:'5px'}}>Editing Draft</div>}
                                     </div>

                                     <div style={{display:'flex', flexDirection:'column', gap:'15px'}}>
                                         {schemaFields.map((f) => {
                                             let errorMsg = null;
                                             const val = nodeEditorForm[f.path];
                                             const isMulti = isMultilineField('ui.node.text', f.path);

                                             if (f.required && (val === undefined || val === null || val === '')) {
                                                 errorMsg = 'Required';
                                             } else if (f.enumOptions && f.enumOptions.length > 0 && val && !f.enumOptions.includes(val)) {
                                                 errorMsg = 'Must be one of: ' + f.enumOptions.join(', ');
                                             }

                                             return (
                                                 <div key={f.path}>
                                                     {f.type === 'boolean' ? (
                                                         <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                                             <input
                                                                 type="checkbox"
                                                                 checked={!!nodeEditorForm[f.path]}
                                                                 onChange={(e) => {
                                                                     setNodeEditorForm({...nodeEditorForm, [f.path]: e.target.checked});
                                                                     setNodeEditorDirty(true);
                                                                 }}
                                                                 id={'field-' + f.path}
                                                             />
                                                             <label htmlFor={'field-' + f.path} style={{cursor:'pointer', fontWeight:'bold', color:'#333'}}>
                                                                {f.title} {f.required && <span style={{color:'#d32f2f'}}>*</span>}
                                                             </label>
                                                         </div>
                                                     ) : (
                                                         <>
                                                            <label style={{display:'block', fontWeight:'bold', marginBottom:'6px', color:'#333'}}>
                                                                {f.title} {f.required && <span style={{color:'#d32f2f'}}>*</span>}
                                                            </label>
                                                            {f.enumOptions && f.enumOptions.length > 0 ? (
                                                                <select
                                                                    value={nodeEditorForm[f.path] || ''}
                                                                    onChange={(e) => {
                                                                        setNodeEditorForm({...nodeEditorForm, [f.path]: e.target.value});
                                                                        setNodeEditorDirty(true);
                                                                    }}
                                                                    style={{
                                                                        width:'100%', padding:'10px', fontSize:'1em',
                                                                        border: errorMsg ? '1px solid #d32f2f' : '1px solid #ccc',
                                                                        borderRadius:'4px', boxSizing:'border-box', backgroundColor:'#333', color:'white'
                                                                    }}
                                                                >
                                                                    <option value="" style={{backgroundColor:'#333', color:'white'}}>(Select Option)</option>
                                                                    {f.enumOptions.map(opt => (
                                                                        <option key={opt} value={opt} style={{backgroundColor:'#333', color:'white'}}>{opt}</option>
                                                                    ))}
                                                                </select>
                                                            ) : (
                                                                isMulti ? (
                                                                    <AutoGrowTextArea
                                                                        value={nodeEditorForm[f.path] || ''}
                                                                        onChange={(e: any) => {
                                                                            setNodeEditorForm({...nodeEditorForm, [f.path]: e.target.value});
                                                                            setNodeEditorDirty(true);
                                                                        }}
                                                                        style={{
                                                                            width:'100%', padding:'10px', fontSize:'1em',
                                                                            border: errorMsg ? '1px solid #d32f2f' : '1px solid #ccc',
                                                                            borderRadius:'4px', boxSizing:'border-box'
                                                                        }}
                                                                        placeholder={'Enter ' + f.title + '...'}
                                                                    />
                                                                ) : (
                                                                    <input
                                                                        type="text"
                                                                        value={nodeEditorForm[f.path] || ''}
                                                                        onChange={(e) => {
                                                                            setNodeEditorForm({...nodeEditorForm, [f.path]: e.target.value});
                                                                            setNodeEditorDirty(true);
                                                                        }}
                                                                        style={{
                                                                            width:'100%', padding:'10px', fontSize:'1em',
                                                                            border: errorMsg ? '1px solid #d32f2f' : '1px solid #ccc',
                                                                            borderRadius:'4px', boxSizing:'border-box'
                                                                        }}
                                                                        placeholder={'Enter ' + f.title + '...'}
                                                                    />
                                                                )
                                                            )}
                                                         </>
                                                     )}
                                                     {errorMsg && (
                                                         <div style={{color:'#d32f2f', fontSize:'0.8em', marginTop:'2px', fontWeight:'bold'}}>
                                                             {errorMsg}
                                                         </div>
                                                     )}
                                                     <div style={{fontSize:'0.8em', color:'#888', marginTop:'4px'}}>
                                                        {f.description || ('Mapped to ' + f.path)}
                                                     </div>
                                                 </div>
                                             );
                                         })}
                                         
                                         <div style={{display:'flex', gap:'15px', alignItems:'center', marginTop:'30px', paddingTop:'20px', borderTop:'1px solid #eee'}}>
                                             <button 
                                                 onClick={handleSaveNodeDraftVersion}
                                                 disabled={!nodeEditorDirty || nodeDraftSaving}
                                                 style={{
                                                     padding:'10px 20px', 
                                                     background: nodeEditorDirty ? '#007acc' : '#e0e0e0', 
                                                     color: nodeEditorDirty ? 'white' : '#888',
                                                     border:'none', borderRadius:'4px', cursor: (nodeEditorDirty && !nodeDraftSaving) ? 'pointer' : 'default', fontWeight:'bold',
                                                     boxShadow: nodeEditorDirty ? '0 2px 4px rgba(0,122,204,0.3)' : 'none',
                                                     transition: 'all 0.2s'
                                                 }}
                                             >
                                                 {nodeDraftSaving ? 'Saving Draft…' : (nodeEditorDirty ? 'Save Draft' : 'No Changes')}
                                             </button>
                                             
                                             {!draftBundle && (
                                                <div style={{color:'#e65100', fontSize:'0.9em', background:'#fff3e0', padding:'8px', borderRadius:'4px', border:'1px solid #ffe0b2'}}>
                                                    <strong>Draft not started.</strong> Editing will initialize a new draft.
                                                </div>
                                             )}
                                             
                                             {/* Deployed Button inside Node Editor */}
                                             {draftBundle && (
                                                <div style={{marginLeft:'auto', display:'flex', flexDirection:'column', alignItems:'flex-end'}}>
                                                {renderValidationSummary()}
                                                <button 
                                                    onClick={() => { if (lastDraftVersionId) setShowActivateDraftModal(true); }}
                                                    disabled={!lastDraftVersionId || nodeDraftSaving || activateDraftSaving}
                                                    style={{
                                                        padding:'10px 20px', fontSize:'1em', 
                                                        background: lastDraftVersionId ? '#e65100' : '#eee', 
                                                        color: lastDraftVersionId ? '#fff' : '#888', 
                                                        border:'1px solid #e65100', borderRadius:'4px', cursor: (!lastDraftVersionId || nodeDraftSaving || activateDraftSaving) ? 'not-allowed' : 'pointer',
                                                        fontWeight: 'bold'
                                                    }}
                                                    title={lastDraftVersionId ? "Activate saved draft version" : "Save a draft first"}
                                                >
                                                    {activateDraftSaving ? 'Activating…' : 'Activate Draft'}
                                                </button>
                                                </div>
                                             )}
                                         </div>
                                     </div>
                                 </div>
                             ) : (
                                 <div style={{height:'100%', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', color:'#ccc'}}>
                                     <div style={{fontSize:'3em', marginBottom:'10px'}}>📝</div>
                                     <div style={{fontSize:'1.2em'}}>Select a text node from the list</div>
                                 </div>
                             )}
                         </div>
                     </div>
                 );
            }

            case 'Node Editor (Container)': {
                 // Ensure graph is loaded
                 if (!resolvedGraph && !resolvedGraphLoading && !resolvedGraphError) {
                     setTimeout(() => refreshResolvedGraph(), 0);
                 }

                 if (resolvedGraphLoading) return <div style={{padding:'20px'}}>Loading graph...</div>;
                 if (resolvedGraphError) return <div style={{padding:'20px', color:'red'}}>Error: {resolvedGraphError}</div>;
                 if (!resolvedGraph) return <div style={{padding:'20px'}}>No graph data.</div>;

                 // Handle Schema Loading
                 if (containerSchemaLoading) return <div style={{padding:'20px'}}>Loading Schema...</div>;
                 if (!containerSchema) return <div style={{padding:'20px'}}>Waiting for schema...</div>;

                 // Filter Container Nodes
                 const nodes = resolvedGraph.nodesById || {};
                 const containerNodes = Object.values(nodes).filter((n: any) => n.type === 'ui.node.container');
                 
                 const selectedNode = nodeEditorSelectedId ? getEffectiveNode(nodeEditorSelectedId) : null;
                 const draftBundle = bundleData; 

                 return (
                     <div style={{display:'flex', height:'100%'}}>
                         <div style={{width:'250px', borderRight:'1px solid #ddd', overflowY:'auto', padding:'10px', background:'#fafafa'}}>
                             <div style={{fontWeight:'bold', marginBottom:'10px', color:'#333'}}>Containers ({containerNodes.length})</div>
                             {containerNodes.length === 0 && <div style={{fontStyle:'italic', color:'#666'}}>No container nodes.</div>}
                             {containerNodes.map((n:any) => {
                                 const isDraft = !!(draftBundle as any)?.blocks?.[n.id];
                                 let displayLabel = n.id;
                                 if (n.props?.direction) displayLabel += ` (${n.props.direction})`;
                                 else if (n.props?.layout) displayLabel += ` (${n.props.layout})`;

                                 return (
                                     <div 
                                        key={n.id} 
                                        onClick={() => handleNodeSelect(n.id)}
                                        style={{
                                            padding:'8px', cursor:'pointer', 
                                            background: nodeEditorSelectedId === n.id ? '#e3f2fd' : 'white',
                                            borderBottom:'1px solid #eee',
                                            borderRadius:'4px',
                                            marginBottom:'2px',
                                            border: nodeEditorSelectedId === n.id ? '1px solid #90caf9' : '1px solid transparent'
                                        }}
                                     >
                                         <div style={{fontWeight:'bold', fontSize:'0.9em'}}>{displayLabel}</div>
                                         <div style={{fontSize:'0.8em', color:'#666', fontFamily:'monospace'}}>{n.id}</div>
                                         {isDraft && <span style={{fontSize:'0.7em', background:'#e8f5e9', color:'green', padding:'1px 4px', borderRadius:'3px', border:'1px solid #c8e6c9', fontWeight:'bold'}}>DRAFT</span>}
                                     </div>
                                 );
                             })}
                         </div>
                         
                         <div style={{flex:1, padding:'20px', overflowY:'auto'}}>
                             {selectedNode ? (
                                 <div style={{maxWidth:'600px'}}>
                                     <div style={{borderBottom:'1px solid #ddd', paddingBottom:'10px', marginBottom:'20px'}}>
                                         <h3>Editing: {selectedNode.id}</h3>
                                         {snapshotData?.activeVersionId && <div style={{color:'#666', fontSize:'0.9em', marginTop:'2px'}}>Active Version: <strong>{snapshotData.activeVersionId}</strong></div>}
                                         <div style={{color:'#666'}}>Type: {selectedNode.type}</div>
                                         {selectedNode._source === 'ACTIVE' && <div style={{color:'#f57f17', fontSize:'0.9em', marginTop:'5px'}}>Editing Active Node (Will create Draft)</div>}
                                         {selectedNode._source === 'DRAFT' && <div style={{color:'green', fontSize:'0.9em', marginTop:'5px'}}>Editing Draft</div>}
                                     </div>

                                     <div style={{display:'flex', flexDirection:'column', gap:'15px'}}>
                                         {schemaFields.map(f => {
                                             let errorMsg = null;
                                             const val = nodeEditorForm[f.path];
                                             
                                             if (f.required && (val === undefined || val === null || val === '')) {
                                                 errorMsg = "Required";
                                             } else if (f.enumOptions && f.enumOptions.length > 0 && val && !f.enumOptions.includes(val)) {
                                                 errorMsg = 'Must be one of: ' + f.enumOptions.join(', ');
                                             }

                                             return (
                                             <div key={f.path}>
                                                 {f.type === 'boolean' ? (
                                                     <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                                         <input 
                                                             type="checkbox" 
                                                             checked={!!nodeEditorForm[f.path]} 
                                                             onChange={(e) => {
                                                                 setNodeEditorForm({...nodeEditorForm, [f.path]: e.target.checked});
                                                                 setNodeEditorDirty(true);
                                                             }}
                                                                                id={'field-' + f.path}
                                                         />
                                                                            <label htmlFor={'field-' + f.path} style={{cursor:'pointer', fontWeight:'bold', color:'#333'}}>
                                                             {f.title} {f.required && <span style={{color:'#d32f2f'}}>*</span>}
                                                         </label>
                                                     </div>
                                                 ) : (
                                                     <>
                                                        <label style={{display:'block', fontWeight:'bold', marginBottom:'6px', color:'#333'}}>
                                                            {f.title} {f.required && <span style={{color:'#d32f2f'}}>*</span>}
                                                        </label>
                                                        {f.enumOptions && f.enumOptions.length > 0 ? (
                                                            <select
                                                                value={nodeEditorForm[f.path] || ''}
                                                                onChange={(e) => {
                                                                    setNodeEditorForm({...nodeEditorForm, [f.path]: e.target.value});
                                                                    setNodeEditorDirty(true);
                                                                }}
                                                                style={{
                                                                    width:'100%', padding:'10px', fontSize:'1em', 
                                                                    border: errorMsg ? '1px solid #d32f2f' : '1px solid #ccc',
                                                                    borderRadius:'4px', boxSizing:'border-box', backgroundColor:'#333', color:'white'
                                                                }}
                                                            >
                                                                <option value="" style={{backgroundColor:'#333', color:'white'}}>(Select Option)</option>
                                                                {f.enumOptions.map(opt => (
                                                                    <option key={opt} value={opt} style={{backgroundColor:'#333', color:'white'}}>{opt}</option>
                                                                ))}
                                                            </select>
                                                        ) : (
                                                            <input 
                                                                type="text" 
                                                                value={nodeEditorForm[f.path] || ''}
                                                                onChange={(e) => {
                                                                    setNodeEditorForm({...nodeEditorForm, [f.path]: e.target.value});
                                                                    setNodeEditorDirty(true);
                                                                }}
                                                                style={{
                                                                    width:'100%', padding:'10px', fontSize:'1em', 
                                                                    border: errorMsg ? '1px solid #d32f2f' : '1px solid #ccc',
                                                                    borderRadius:'4px', boxSizing:'border-box'
                                                                }}
                                                                    placeholder={'Enter ' + f.title + '...'}
                                                            />
                                                        )}
                                                     </>
                                                 )}
                                                 {errorMsg && (
                                                     <div style={{color:'#d32f2f', fontSize:'0.8em', marginTop:'2px', fontWeight:'bold'}}>
                                                         {errorMsg}
                                                     </div>
                                                 )}
                                                 <div style={{fontSize:'0.8em', color:'#888', marginTop:'4px'}}>
                                                    {f.description || ('Mapped to ' + f.path)}
                                                 </div>
                                             </div>
                                             );
                                         })}
                                         
                                         <div style={{display:'flex', gap:'15px', alignItems:'center', marginTop:'30px', paddingTop:'20px', borderTop:'1px solid #eee'}}>
                                             <button 
                                                 onClick={handleSaveNodeDraftVersion}
                                                 disabled={!nodeEditorDirty || nodeDraftSaving}
                                                 style={{
                                                     padding:'10px 20px', 
                                                     background: nodeEditorDirty ? '#007acc' : '#e0e0e0', 
                                                     color: nodeEditorDirty ? 'white' : '#888',
                                                     border:'none', borderRadius:'4px', cursor: (nodeEditorDirty && !nodeDraftSaving) ? 'pointer' : 'default', fontWeight:'bold',
                                                     boxShadow: nodeEditorDirty ? '0 2px 4px rgba(0,122,204,0.3)' : 'none',
                                                     transition: 'all 0.2s'
                                                 }}
                                             >
                                                 {nodeDraftSaving ? 'Saving Draft…' : (nodeEditorDirty ? 'Save Draft' : 'No Changes')}
                                             </button>
                                             
                                             {!draftBundle && (
                                                <div style={{color:'#e65100', fontSize:'0.9em', background:'#fff3e0', padding:'8px', borderRadius:'4px', border:'1px solid #ffe0b2'}}>
                                                    <strong>Draft not started.</strong> Editing will initialize a new draft.
                                                </div>
                                             )}
                                             
                                             {/* Deployed Button inside Node Editor */}
                                             {draftBundle && (
                                                <div style={{marginLeft:'auto', display:'flex', flexDirection:'column', alignItems:'flex-end'}}>
                                                {renderValidationSummary()}
                                                <button 
                                                    onClick={() => { if (lastDraftVersionId) setShowActivateDraftModal(true); }}
                                                    disabled={!lastDraftVersionId || nodeDraftSaving || activateDraftSaving}
                                                    style={{
                                                        padding:'10px 20px', fontSize:'1em', 
                                                        background: lastDraftVersionId ? '#e65100' : '#eee', 
                                                        color: lastDraftVersionId ? '#fff' : '#888', 
                                                        border:'1px solid #e65100', borderRadius:'4px', cursor: (!lastDraftVersionId || nodeDraftSaving || activateDraftSaving) ? 'not-allowed' : 'pointer',
                                                        fontWeight: 'bold'
                                                    }}
                                                    title={lastDraftVersionId ? "Activate saved draft version" : "Save a draft first"}
                                                >
                                                    {activateDraftSaving ? 'Activating…' : 'Activate Draft'}
                                                </button>
                                                </div>
                                             )}
                                         </div>
                                     </div>
                                 </div>
                             ) : (
                                 <div style={{height:'100%', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', color:'#ccc'}}>
                                     <div style={{fontSize:'3em', marginBottom:'10px'}}>📦</div>
                                     <div style={{fontSize:'1.2em'}}>Select a container from the list</div>
                                 </div>
                             )}
                         </div>
                     </div>
                 );
            }

            case 'Node Editor (Window)': {
                 // Ensure graph is loaded
                 if (!resolvedGraph && !resolvedGraphLoading && !resolvedGraphError) {
                     setTimeout(() => refreshResolvedGraph(), 0);
                 }

                 if (resolvedGraphLoading) return <div style={{padding:'20px'}}>Loading graph...</div>;
                 if (resolvedGraphError) return <div style={{padding:'20px', color:'red'}}>Error: {resolvedGraphError}</div>;
                 if (!resolvedGraph) return <div style={{padding:'20px'}}>No graph data.</div>;

                 // Handle Schema Loading
                 if (windowSchemaLoading) return <div style={{padding:'20px'}}>Loading Schema...</div>;
                 if (!windowSchema) return <div style={{padding:'20px'}}>Waiting for schema...</div>;

                 // Filter Window Nodes
                 const nodes = resolvedGraph.nodesById || {};
                 const windowNodes = Object.values(nodes).filter((n: any) => n.type === 'ui.node.window');
                 
                 const selectedNode = nodeEditorSelectedId ? getEffectiveNode(nodeEditorSelectedId) : null;
                 const draftBundle = bundleData; 

                 return (
                     <div style={{display:'flex', height:'100%'}}>
                         <div style={{width:'250px', borderRight:'1px solid #ddd', overflowY:'auto', padding:'10px', background:'#fafafa'}}>
                             <div style={{fontWeight:'bold', marginBottom:'10px', color:'#333'}}>Windows ({windowNodes.length})</div>
                             {windowNodes.length === 0 && <div style={{fontStyle:'italic', color:'#666'}}>No window nodes.</div>}
                             {windowNodes.map((n:any) => {
                                 const isDraft = !!(draftBundle as any)?.blocks?.[n.id];
                                 let displayLabel = n.id;
                                 if (n.props?.title) displayLabel += ` (${n.props.title})`;

                                 return (
                                     <div 
                                        key={n.id} 
                                        onClick={() => handleNodeSelect(n.id)}
                                        style={{
                                            padding:'8px', cursor:'pointer', 
                                            background: nodeEditorSelectedId === n.id ? '#e3f2fd' : 'white',
                                            borderBottom:'1px solid #eee',
                                            borderRadius:'4px',
                                            marginBottom:'2px',
                                            border: nodeEditorSelectedId === n.id ? '1px solid #90caf9' : '1px solid transparent'
                                        }}
                                     >
                                         <div style={{fontWeight:'bold', fontSize:'0.9em'}}>{displayLabel}</div>
                                         <div style={{fontSize:'0.8em', color:'#666', fontFamily:'monospace'}}>{n.id}</div>
                                         {isDraft && <span style={{fontSize:'0.7em', background:'#e8f5e9', color:'green', padding:'1px 4px', borderRadius:'3px', border:'1px solid #c8e6c9', fontWeight:'bold'}}>DRAFT</span>}
                                     </div>
                                 );
                             })}
                         </div>
                         
                         <div style={{flex:1, padding:'20px', overflowY:'auto'}}>
                             {selectedNode ? (
                                 <div style={{maxWidth:'600px'}}>
                                     <div style={{borderBottom:'1px solid #ddd', paddingBottom:'10px', marginBottom:'20px'}}>
                                         <h3>Editing: {selectedNode.id}</h3>
                                         {snapshotData?.activeVersionId && <div style={{color:'#666', fontSize:'0.9em', marginTop:'2px'}}>Active Version: <strong>{snapshotData.activeVersionId}</strong></div>}
                                         <div style={{color:'#666'}}>Type: {selectedNode.type}</div>
                                         {selectedNode._source === 'ACTIVE' && <div style={{color:'#f57f17', fontSize:'0.9em', marginTop:'5px'}}>Editing Active Node (Will create Draft)</div>}
                                         {selectedNode._source === 'DRAFT' && <div style={{color:'green', fontSize:'0.9em', marginTop:'5px'}}>Editing Draft</div>}
                                     </div>

                                     <div style={{display:'flex', flexDirection:'column', gap:'15px'}}>
                                         {schemaFields.map(f => {
                                             let errorMsg = null;
                                             const val = nodeEditorForm[f.path];
                                             
                                             if (f.required && (val === undefined || val === null || val === '')) {
                                                 errorMsg = "Required";
                                             } else if (f.enumOptions && f.enumOptions.length > 0 && val && !f.enumOptions.includes(val)) {
                                                 errorMsg = 'Must be one of: ' + f.enumOptions.join(', ');
                                             }

                                             return (
                                             <div key={f.path}>
                                                 {f.type === 'boolean' ? (
                                                     <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                                         <input 
                                                             type="checkbox" 
                                                             checked={!!nodeEditorForm[f.path]} 
                                                             onChange={(e) => {
                                                                 setNodeEditorForm({...nodeEditorForm, [f.path]: e.target.checked});
                                                                 setNodeEditorDirty(true);
                                                             }}
                                                             id={'field-' + f.path}
                                                         />
                                                         <label htmlFor={'field-' + f.path} style={{cursor:'pointer', fontWeight:'bold', color:'#333'}}>
                                                             {f.title} {f.required && <span style={{color:'#d32f2f'}}>*</span>}
                                                         </label>
                                                     </div>
                                                 ) : (
                                                     <>
                                                        <label style={{display:'block', fontWeight:'bold', marginBottom:'6px', color:'#333'}}>
                                                            {f.title} {f.required && <span style={{color:'#d32f2f'}}>*</span>}
                                                        </label>
                                                        {f.enumOptions && f.enumOptions.length > 0 ? (
                                                            <select
                                                                value={nodeEditorForm[f.path] || ''}
                                                                onChange={(e) => {
                                                                    setNodeEditorForm({...nodeEditorForm, [f.path]: e.target.value});
                                                                    setNodeEditorDirty(true);
                                                                }}
                                                                style={{
                                                                    width:'100%', padding:'10px', fontSize:'1em', 
                                                                    border: errorMsg ? '1px solid #d32f2f' : '1px solid #ccc',
                                                                    borderRadius:'4px', boxSizing:'border-box', backgroundColor:'#333', color:'white'
                                                                }}
                                                            >
                                                                <option value="" style={{backgroundColor:'#333', color:'white'}}>(Select Option)</option>
                                                                {f.enumOptions.map(opt => (
                                                                    <option key={opt} value={opt} style={{backgroundColor:'#333', color:'white'}}>{opt}</option>
                                                                ))}
                                                            </select>
                                                        ) : (
                                                            <input 
                                                                type="text" 
                                                                value={nodeEditorForm[f.path] || ''}
                                                                onChange={(e) => {
                                                                    setNodeEditorForm({...nodeEditorForm, [f.path]: e.target.value});
                                                                    setNodeEditorDirty(true);
                                                                }}
                                                                style={{
                                                                    width:'100%', padding:'10px', fontSize:'1em', 
                                                                    border: errorMsg ? '1px solid #d32f2f' : '1px solid #ccc',
                                                                    borderRadius:'4px', boxSizing:'border-box'
                                                                }}
                                                                    placeholder={'Enter ' + f.title + '...'}
                                                            />
                                                        )}
                                                     </>
                                                 )}
                                                 {errorMsg && (
                                                     <div style={{color:'#d32f2f', fontSize:'0.8em', marginTop:'2px', fontWeight:'bold'}}>
                                                         {errorMsg}
                                                     </div>
                                                 )}
                                                 <div style={{fontSize:'0.8em', color:'#888', marginTop:'4px'}}>
                                                    {f.description || ('Mapped to ' + f.path)}
                                                 </div>
                                             </div>
                                             );
                                         })}
                                         
                                         <div style={{display:'flex', gap:'15px', alignItems:'center', marginTop:'30px', paddingTop:'20px', borderTop:'1px solid #eee'}}>
                                             <button 
                                                 onClick={handleSaveNodeDraftVersion}
                                                 disabled={!nodeEditorDirty || nodeDraftSaving}
                                                 style={{
                                                     padding:'10px 20px', 
                                                     background: nodeEditorDirty ? '#007acc' : '#e0e0e0', 
                                                     color: nodeEditorDirty ? 'white' : '#888',
                                                     border:'none', borderRadius:'4px', cursor: (nodeEditorDirty && !nodeDraftSaving) ? 'pointer' : 'default', fontWeight:'bold',
                                                     boxShadow: nodeEditorDirty ? '0 2px 4px rgba(0,122,204,0.3)' : 'none',
                                                     transition: 'all 0.2s'
                                                 }}
                                             >
                                                 {nodeDraftSaving ? 'Saving Draft…' : (nodeEditorDirty ? 'Save Draft' : 'No Changes')}
                                             </button>
                                             
                                             {!draftBundle && (
                                                <div style={{color:'#e65100', fontSize:'0.9em', background:'#fff3e0', padding:'8px', borderRadius:'4px', border:'1px solid #ffe0b2'}}>
                                                    <strong>Draft not started.</strong> Editing will initialize a new draft.
                                                </div>
                                             )}
                                             
                                             {/* Deployed Button inside Node Editor */}
                                             {draftBundle && (
                                                <div style={{marginLeft:'auto', display:'flex', flexDirection:'column', alignItems:'flex-end'}}>
                                                {renderValidationSummary()}
                                                <button 
                                                    onClick={() => { if (lastDraftVersionId) setShowActivateDraftModal(true); }}
                                                    disabled={!lastDraftVersionId || nodeDraftSaving || activateDraftSaving}
                                                    style={{
                                                        padding:'10px 20px', fontSize:'1em', 
                                                        background: lastDraftVersionId ? '#e65100' : '#eee', 
                                                        color: lastDraftVersionId ? '#fff' : '#888', 
                                                        border:'1px solid #e65100', borderRadius:'4px', cursor: (!lastDraftVersionId || nodeDraftSaving || activateDraftSaving) ? 'not-allowed' : 'pointer',
                                                        fontWeight: 'bold'
                                                    }}
                                                    title={lastDraftVersionId ? "Activate saved draft version" : "Save a draft first"}
                                                >
                                                    {activateDraftSaving ? 'Activating…' : 'Activate Draft'}
                                                </button>
                                                </div>
                                             )}
                                         </div>
                                     </div>
                                 </div>
                             ) : (
                                 <div style={{height:'100%', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', color:'#ccc'}}>
                                     <div style={{fontSize:'3em', marginBottom:'10px'}}>🔲</div>
                                     <div style={{fontSize:'1.2em'}}>Select a window from the list</div>
                                 </div>
                             )}
                         </div>
                     </div>
                 );
            }

            case 'ConfigSysadmin': {
                const sysRefresh: SysRefresh = {
                    bundle: onRefresh,
                    resolvedGraph: refreshResolvedGraph,
                    derived: async () => {},
                    snapshot: refreshSnapshot
                };
                return (
                    <ConfigSysadminView 
                        bundleData={bundleData} 
                        renderKnownPanel={renderKnownPanel} 
                        activeVersionId={snapshotData?.activeVersionId}
                        sysRefresh={sysRefresh}
                        pendingStage={pendingStage}
                        setPendingStage={setPendingStage}
                        saveMessage={saveMessage}
                        setSaveMessage={setSaveMessage}
                        pendingPreflight={pendingPreflight}
                        setPendingPreflight={setPendingPreflight}
                        pendingAck={pendingAck}
                        setPendingAck={setPendingAck}
                        pendingCandidateVersionId={pendingCandidateVersionId}
                        setPendingCandidateVersionId={setPendingCandidateVersionId}
                        dismissTimerRef={saveDismissTimerRef}
                        onCloneSysadminDraft={async (blocks, reason) => {
                            let currentVersionId = snapshotData?.activeVersionId;
                            
                            if (!currentVersionId) {
                                try {
                                    const snap = await refreshSnapshot();
                                    currentVersionId = snap?.activeVersionId;
                                } catch (e) {
                                    console.error("Failed to refresh snapshot for save", e);
                                    // Fall through
                                }
                            }

                            if (!currentVersionId) throw new Error("No active base version found");
                            
                            // 1. Clone & Patch (Standard Governed Endpoint)
                            const patchRes = await fetch(apiUrl('/api/config/shell/clone-and-patch-sysadmin'), {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    baseVersionId: currentVersionId,
                                    reason,
                                    sysadminBlocks: blocks
                                })
                            });
                            if (!patchRes.ok) {
                                const err = await patchRes.json();
                                throw new Error(err.error || "Failed to patch");
                            }
                            const patchJson = await patchRes.json();
                            return patchJson.newVersionId;
                        }}
                        onActivateVersion={async (versionId, reason) => {
                            // Standard Governed Endpoint
                            const activateRes = await fetch(apiUrl('/api/config/shell/activate'), {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    versionId,
                                    reason
                                })
                            });
                            if (!activateRes.ok) {
                                const err = await activateRes.json();
                                throw new Error(err.error || "Failed to activate");
                            }
                            
                            // Refresh UI
                            refreshSnapshot();
                            setTimeout(() => {
                                onRefresh();
                                refreshVersions();
                            }, 500);
                        }}
                        setConfirmModal={setConfirmModal}
                    />
                );
            }
            case 'ShellConfig': {
                if (!bundleData) return <div style={{padding:'20px', color:'#666'}}>No bundle/config loaded yet.</div>;
                return (
                    <div>
                        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px'}}>
                             <div style={{fontWeight:'bold', fontSize:'0.9em'}}>ShellConfig</div>
                             <div style={{fontSize:'0.8em', color:'#888'}}>Read-only (editing not implemented yet)</div>
                        </div>
                        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'5px'}}>
                             <strong style={{fontSize:'0.9em'}}>Bundle Configuration</strong>
                             <CopyBtn k="shellconfig" text={bundleData} />
                        </div>
                        <pre style={preStyle}>{JSON.stringify(bundleData, null, 2)}</pre>
                    </div>
                );
            }
            case 'Blocks': {
                 if (!bundleData) return <div style={{padding:'20px', color:'#666'}}>No bundle/config loaded yet.</div>;
                 const blocksMap = (bundleData as any).blocks;
                 if (!blocksMap) return <div style={{padding:'20px', color:'#666'}}>No blocks found in bundleData.blocks.</div>;
                 
                 const blocksArr = Array.isArray(blocksMap) 
                    ? blocksMap 
                    : typeof blocksMap === 'object' 
                        ? Object.values(blocksMap) 
                        : [];

                 const f = filter.toLowerCase();
                 const filtered = blocksArr.filter((b: any) => {
                    const bid = b.blockId || b.id || '';
                    const btype = b.blockType || '';
                    const bfile = b.filename || '';
                    return !f || bid.toLowerCase().includes(f) || btype.toLowerCase().includes(f) || bfile.toLowerCase().includes(f);
                 });
                 
                 const selectedBlock = selectedBlockId ? blocksArr.find((b:any) => (b.blockId === selectedBlockId || b.id === selectedBlockId)) : null;
                 const selectedBlockType = selectedBlock?.blockType as string | undefined;
                 const isPatchable = isPatchableBlockType(selectedBlockType);
                 const parsedEditor = parseJsonSafely(blocksEditorText);
                 const isEditorValid = !blocksEditorError;
                 const baselineParsed = parseJsonSafely(blocksEditorBaseline);
                 const dirtyCompared = isEditorValid && !baselineParsed.error
                     ? JSON.stringify(parsedEditor.value) !== JSON.stringify(baselineParsed.value)
                     : blocksEditorDirty;

                 return (
                     <div style={{display:'flex', flexDirection:'column', height:'100%'}}>
                         <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px'}}>
                             <div style={{fontWeight:'bold', fontSize:'0.9em'}}>Blocks</div>
                            <div />
                         </div>
                         <div style={{marginBottom:'10px'}}>
                             <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'4px'}}>
                                 <label style={{fontSize:'0.85em', fontWeight:'bold', color:'#555'}}>
                                     Filter Blocks
                                 </label>
                                 {filter && (
                                     <span style={{fontSize:'0.75em', background:'#e3f2fd', color:'#0277bd', padding:'2px 8px', borderRadius:'10px', fontWeight:'bold'}}>
                                         Filtered ({filtered.length})
                                     </span>
                                 )}
                             </div>
                             <div style={{display:'flex', gap:'5px'}}>
                                 <input 
                                    type="text" 
                                    placeholder="Search by ID, type, or filename..." 
                                    value={filter} 
                                    onChange={e=>setFilter(e.target.value)} 
                                    style={{
                                        flex: 1, 
                                        padding:'6px', 
                                        boxSizing:'border-box', 
                                        border: filter ? '2px solid #81d4fa' : '1px solid #ccc',
                                        borderRadius: '3px',
                                        outline:'none',
                                        backgroundColor: filter ? '#fdfdfd' : 'white'
                                    }}
                                 />
                                 {filter && (
                                     <button 
                                        onClick={() => setFilter('')}
                                        style={{
                                            border: '1px solid #ccc',
                                            background: '#fff',
                                            borderRadius: '3px',
                                            padding: '0 10px',
                                            cursor: 'pointer',
                                            color: '#d32f2f',
                                            fontWeight: 'bold',
                                            fontSize: '0.85em',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                        title="Clear Filter"
                                     >
                                         <span>Clear filter</span>
                                         <span>✕</span>
                                     </button>
                                 )}
                             </div>
                         </div>
                         <div style={{display:'flex', flex:1, overflow:'hidden', gap:'10px'}}>
                             {/* Left Column: List */}
                             <div style={{flex: '0 0 45%', overflowY:'auto', borderRight:'1px solid #ddd', paddingRight:'5px'}}>
                                 {filtered.map((b: any, i: number) => {
                                     const bid = b.blockId || b.id || `unknown-${i}`;
                                     const isSel = bid === selectedBlockId;
                                     return (
                                        <div 
                                            key={bid} 
                                            onClick={() => setSelectedBlockId(bid)}
                                            style={{
                                                border: isSel ? '1px solid #007acc' : '1px solid #ddd', 
                                                background: isSel ? '#e6f7ff' : 'white',
                                                padding:'6px', 
                                                marginBottom:'5px', 
                                                cursor:'pointer',
                                                fontSize:'0.9em'
                                            }}
                                        >
                                            <div style={{fontWeight:'bold', color:'#222'}}>{bid}</div>
                                            <div style={{fontSize:'0.85em', color:'#555'}}>{b.blockType}</div>
                                            {b.filename && <div style={{fontSize:'0.8em', color:'#888'}}>{b.filename}</div>}
                                        </div>
                                     );
                                 })}
                                 {filtered.length === 0 && <div style={{fontStyle:'italic', padding:'10px'}}>No matching blocks.</div>}
                             </div>
                             
                             {/* Right Column: Details */}
                             <div style={{flex:1, overflowY:'auto', paddingLeft:'5px'}}>
                                 {selectedBlock ? (
                                    <>
                                        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'5px'}}>
                                            <strong style={{fontSize:'0.9em'}}>Block Details</strong>
                                            <CopyBtn k="block" text={selectedBlock} />
                                        </div>
                                        <pre style={preStyle}>{JSON.stringify(selectedBlock, null, 2)}</pre>
                                        <div style={{marginTop:'10px', border:'1px solid #ddd', borderRadius:'4px', overflow:'hidden'}}>
                                            <div style={{padding:'8px', background:'#f5f5f5', borderBottom:'1px solid #ddd', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                                <strong style={{fontSize:'0.9em'}}>Advanced JSON (Block Data)</strong>
                                                {selectedBlockType && !isPatchable && (
                                                    <span style={{fontSize:'0.8em', color:'#888'}}>Read-only for {selectedBlockType}</span>
                                                )}
                                            </div>
                                            {isPatchable ? (
                                                <div style={{padding:'8px'}}>
                                                    <textarea
                                                        value={blocksEditorText}
                                                        onChange={(e) => {
                                                            const nextText = e.target.value;
                                                            setBlocksEditorText(nextText);
                                                            const parsed = parseJsonSafely(nextText);
                                                            setBlocksEditorError(parsed.error);
                                                            if (!parsed.error) {
                                                                const baseParsed = parseJsonSafely(blocksEditorBaseline);
                                                                if (!baseParsed.error) {
                                                                    setBlocksEditorDirty(JSON.stringify(parsed.value) !== JSON.stringify(baseParsed.value));
                                                                } else {
                                                                    setBlocksEditorDirty(true);
                                                                }
                                                            } else {
                                                                setBlocksEditorDirty(true);
                                                            }
                                                        }}
                                                        rows={10}
                                                        style={{width:'100%', resize:'vertical', padding:'8px', border:'1px solid #ccc', borderRadius:'4px', fontFamily:'monospace'}}
                                                    />
                                                    {!showActivateDraftModal && (
                                                        <div style={{marginTop:'6px', fontSize:'0.85em', color: isEditorValid ? '#2e7d32' : '#c62828'}}>
                                                            {isEditorValid ? 'Valid JSON' : `Invalid JSON: ${blocksEditorError}`}
                                                        </div>
                                                    )}
                                                    <div style={{display:'flex', gap:'8px', marginTop:'10px'}}>
                                                        <button
                                                            onClick={handleSaveBlocksDraft}
                                                            disabled={!isEditorValid || !dirtyCompared || blocksDraftSaving}
                                                            style={{cursor: (!isEditorValid || !dirtyCompared || blocksDraftSaving) ? 'default' : 'pointer', padding:'4px 8px', fontSize:'0.85em'}}
                                                        >
                                                            {blocksDraftSaving ? 'Saving Draft…' : 'Save Draft'}
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setBlocksEditorText(blocksEditorBaseline);
                                                                setBlocksEditorError(null);
                                                                setBlocksEditorDirty(false);
                                                            }}
                                                            disabled={!dirtyCompared}
                                                            style={{cursor: (!dirtyCompared) ? 'default' : 'pointer', padding:'4px 8px', fontSize:'0.85em'}}
                                                        >
                                                            Reset
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                if (!isEditorValid || parsedEditor.value === null) return;
                                                                const formatted = JSON.stringify(parsedEditor.value, null, 2);
                                                                setBlocksEditorText(formatted);
                                                                setBlocksEditorError(null);
                                                                const baseParsed = parseJsonSafely(blocksEditorBaseline);
                                                                if (!baseParsed.error) {
                                                                    setBlocksEditorDirty(JSON.stringify(parsedEditor.value) !== JSON.stringify(baseParsed.value));
                                                                }
                                                            }}
                                                            disabled={!isEditorValid}
                                                            style={{cursor: (!isEditorValid) ? 'default' : 'pointer', padding:'4px 8px', fontSize:'0.85em'}}
                                                        >
                                                            Format
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{padding:'8px', color:'#888', fontSize:'0.85em'}}>
                                                    Read-only (editing not implemented yet for blockType: {selectedBlockType || 'unknown'})
                                                </div>
                                            )}
                                        </div>
                                    </>
                                 ) : (
                                    <div style={{fontStyle:'italic', color:'#666', padding:'10px'}}>Select a block to view details.</div>
                                 )}
                             </div>
                         </div>
                     </div>
                 );
            }
            case 'Bindings': {
                 if (!bundleData) return <div style={{padding:'20px', color:'#666'}}>No bundle/config loaded yet.</div>;
                 const blocksMap = (bundleData as any).blocks;
                 if (!blocksMap) return <div style={{padding:'20px', color:'#666'}}>No blocks found in bundleData.blocks to scan for bindings.</div>;
                 
                 const blocksArr = Array.isArray(blocksMap) 
                    ? blocksMap 
                    : typeof blocksMap === 'object' 
                        ? Object.values(blocksMap) 
                        : [];

                 // Filter for bindings (blockType="binding")
                 const bindingsArr = blocksArr.filter((b: any) => b.blockType === 'binding');

                 if (bindingsArr.length === 0) {
                     return (
                        <div style={{padding:'20px'}}>
                            <div style={{fontWeight:'bold'}}>No bindings found.</div>
                            <div style={{fontSize:'0.85em', color:'#888', marginTop:'10px'}}>
                                Searched in: bundleData.blocks where blockType === "binding"
                            </div>
                        </div>
                     );
                 }

                 const f = filter.toLowerCase();
                 const filtered = bindingsArr.filter((b: any) => {
                    const bid = b.blockId || b.id || '';
                    const mode = b.data?.mode || 'unknown';
                    return !f || bid.toLowerCase().includes(f) || mode.toLowerCase().includes(f);
                 });
                 
                 const selectedBinding = selectedBindingId ? bindingsArr.find((b:any) => (b.blockId === selectedBindingId || b.id === selectedBindingId)) : null;
                 const selectedBindingData = selectedBinding?.data || {};
                 const endpoints = Array.isArray(selectedBindingData.endpoints) ? selectedBindingData.endpoints : [];
                 const sourceEp = endpoints.find((e:any) => e.direction === 'out') || endpoints.find((e:any) => e.endpointId === 'source');
                 const destEp = endpoints.find((e:any) => e.direction === 'in') || endpoints.find((e:any) => e.endpointId === 'dest');
                 const mapping = selectedBindingData.mapping || {};
                 const mode = selectedBindingData.mode || 'unknown';
                 const enabled = selectedBindingData.enabled !== false;
                 const bindingSchema = blockSchemas['binding'];
                 const bindingSchemaError = blockSchemaErrors['binding'];
                 const bindingJsonParsed = parseJsonSafely(bindingsEditorText);
                 const bindingSchemaValidation = bindingSchema && !bindingJsonParsed.error
                     ? validateWithSchemaMinimal(bindingSchema, bindingJsonParsed.value)
                     : { valid: true, errors: [] as string[] };
                 const bindingJsonValue = (!bindingJsonParsed.error && bindingJsonParsed.value && typeof bindingJsonParsed.value === 'object')
                     ? bindingJsonParsed.value as Record<string, unknown>
                     : null;
                 const bindingJsonEnabled = bindingJsonValue && typeof bindingJsonValue.enabled === 'boolean'
                     ? bindingJsonValue.enabled
                     : undefined;
                 const enabledDisplay = typeof bindingJsonEnabled === 'boolean' ? bindingJsonEnabled : enabled;
                 const canToggleEnabled = typeof bindingJsonEnabled === 'boolean';

                 const sourceBlockId = sourceEp?.target?.blockId;
                 const destBlockId = destEp?.target?.blockId;
                 const sourcePath = sourceEp?.target?.path;
                 const destPath = destEp?.target?.path;

                 const sourceBlock = sourceBlockId ? (blocksMap as any)[sourceBlockId] : null;
                 const destBlock = destBlockId ? (blocksMap as any)[destBlockId] : null;
                 const sourceBlockType = sourceBlock?.blockType;
                 const destBlockType = destBlock?.blockType;

                 const canJumpToData = typeof sourceBlockType === 'string' && sourceBlockType.startsWith('data.') && !!sourceBlockId;

                 let nodeEditorTab: string | null = null;
                 if (destBlockType === 'ui.node.button') nodeEditorTab = 'Node Editor (Button)';
                 else if (destBlockType === 'ui.node.text') nodeEditorTab = 'Node Editor (Text)';
                 else if (destBlockType === 'ui.node.container') nodeEditorTab = 'Node Editor (Container)';
                 else if (destBlockType === 'ui.node.window') nodeEditorTab = 'Node Editor (Window)';

                 let derivedPreview: unknown = undefined;
                 if (destBlockId && derivedPatches?.[destBlockId]) {
                     const patch = derivedPatches[destBlockId];
                     if (typeof destPath === 'string' && destPath.length > 0) {
                         const normalized = destPath.startsWith('/') ? destPath.slice(1).replace(/\//g, '.') : destPath;
                         derivedPreview = getValueByPath(patch, normalized);
                     }
                 }

                 return (
                     <div style={{display:'flex', flexDirection:'column', height:'100%'}}>
                         <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px'}}>
                             <div style={{fontWeight:'bold', fontSize:'0.9em'}}>Bindings</div>
                             <div />
                         </div>
                         <input 
                            type="text" 
                            placeholder="Filter bindings (id/mode)..." 
                            value={filter} 
                            onChange={e=>setFilter(e.target.value)} 
                            style={{width:'100%', marginBottom:'10px', padding:'6px', boxSizing:'border-box', border:'1px solid #ccc'}}
                         />
                         <div style={{display:'flex', flex:1, overflow:'hidden', gap:'10px'}}>
                             {/* Left Column: List */}
                             <div style={{flex: '0 0 45%', overflowY:'auto', borderRight:'1px solid #ddd', paddingRight:'5px'}}>
                                 {filtered.map((b: any, i: number) => {
                                     const bid = b.blockId || b.id || `binding-${i}`;
                                     const isSel = bid === selectedBindingId;
                                     const mode = b.data?.mode || 'unknown';
                                     return (
                                        <div 
                                            key={bid} 
                                            onClick={() => setSelectedBindingId(bid)}
                                            style={{
                                                border: isSel ? '1px solid #007acc' : '1px solid #ddd', 
                                                background: isSel ? '#e6f7ff' : 'white',
                                                padding:'6px', 
                                                marginBottom:'5px', 
                                                cursor:'pointer',
                                                fontSize:'0.9em'
                                            }}
                                        >
                                            <div style={{fontWeight:'bold', color:'#222'}}>{bid}</div>
                                            <div style={{fontSize:'0.85em', color: mode === 'triggered' ? '#c00' : '#007'}}>{mode.toUpperCase()}</div>
                                        </div>
                                     );
                                 })}
                                 {filtered.length === 0 && <div style={{fontStyle:'italic', padding:'10px'}}>No matching bindings.</div>}
                             </div>
                             
                             {/* Right Column: Details */}
                             <div style={{flex:1, overflowY:'auto', paddingLeft:'5px'}}>
                                 {selectedBinding ? (
                                    <>
                                        <div style={{marginBottom:'10px', padding:'8px', border:'1px solid #ddd', borderRadius:'4px', background:'#fafafa'}}>
                                            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'6px'}}>
                                                <strong style={{fontSize:'0.9em'}}>Summary</strong>
                                                <span style={{fontSize:'0.85em', color: enabledDisplay ? '#2e7d32' : '#c62828'}}>
                                                    {enabledDisplay ? 'Enabled' : 'Disabled'} | {String(mode).toUpperCase()}
                                                </span>
                                            </div>
                                            <div style={{fontSize:'0.85em', color:'#333', marginBottom:'6px'}}>
                                                <strong>Source:</strong> {sourceBlockId || '(unknown)'} {sourcePath ? <span style={{color:'#666'}}>({sourcePath})</span> : <span style={{color:'#999'}}>(no path)</span>}
                                            </div>
                                            <div style={{fontSize:'0.85em', color:'#333', marginBottom:'6px'}}>
                                                <strong>Dest:</strong> {destBlockId || '(unknown)'} {destPath ? <span style={{color:'#666'}}>({destPath})</span> : <span style={{color:'#999'}}>(no path)</span>}
                                            </div>
                                            <div style={{fontSize:'0.85em', color:'#333', marginBottom:'6px'}}>
                                                <strong>Mapping:</strong> {mapping?.kind || 'unknown'} {mapping?.from ? <span style={{color:'#666'}}>from {mapping.from}</span> : null} {mapping?.to ? <span style={{color:'#666'}}>to {mapping.to}</span> : null}
                                            </div>
                                            <div style={{fontSize:'0.85em', color:'#333'}}>
                                                <strong>Derived Preview:</strong> {derivedPreview !== undefined && derivedPreview !== '' ? (
                                                    <span style={{marginLeft:'6px', color:'#1565c0'}}>{String(derivedPreview)}</span>
                                                ) : (
                                                    <span style={{marginLeft:'6px', color:'#999'}}>(no derived patch)</span>
                                                )}
                                            </div>
                                            <div style={{display:'flex', gap:'8px', marginTop:'8px'}}>
                                                <button
                                                    onClick={() => {
                                                        if (!canJumpToData) return;
                                                        setActiveTab('Data');
                                                        if (sourceBlockId) setSelectedDataBlockId(sourceBlockId);
                                                    }}
                                                    disabled={!canJumpToData}
                                                    style={{fontSize:'0.85em', padding:'4px 8px', cursor: canJumpToData ? 'pointer' : 'default'}}
                                                >
                                                    Jump to Data
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (!nodeEditorTab || !destBlockId) return;
                                                        setActiveTab(nodeEditorTab);
                                                        setNodeEditorSelectedId(destBlockId);
                                                    }}
                                                    disabled={!nodeEditorTab || !destBlockId}
                                                    style={{fontSize:'0.85em', padding:'4px 8px', cursor: nodeEditorTab && destBlockId ? 'pointer' : 'default'}}
                                                >
                                                    Jump to Node
                                                </button>
                                            </div>
                                        </div>
                                        <div style={{marginBottom:'10px', padding:'8px', border:'1px solid #ddd', borderRadius:'4px', background:'#fafafa'}}>
                                            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'6px'}}>
                                                <strong style={{fontSize:'0.9em'}}>Quick Controls</strong>
                                                <span style={{fontSize:'0.8em', color: bindingJsonParsed.error ? '#c62828' : (bindingSchema ? (bindingSchemaValidation.valid ? '#2e7d32' : '#c62828') : '#888')}}>
                                                    {bindingJsonParsed.error
                                                        ? `Invalid JSON: ${bindingJsonParsed.error}`
                                                        : bindingSchema
                                                            ? (bindingSchemaValidation.valid ? 'Schema valid' : 'Schema invalid')
                                                            : (bindingSchemaError || 'Schema unavailable')}
                                                </span>
                                            </div>
                                            {canToggleEnabled ? (
                                                <label style={{display:'flex', alignItems:'center', gap:'8px', fontSize:'0.85em'}}>
                                                    <input
                                                        type="checkbox"
                                                        checked={!!bindingJsonEnabled}
                                                        onChange={() => {
                                                            if (bindingJsonEnabled === undefined) return;
                                                            const nextEnabled = !bindingJsonEnabled;
                                                            const baseObj = bindingJsonValue || (selectedBindingData as Record<string, unknown>);
                                                            const nextObj = { ...baseObj, enabled: nextEnabled };
                                                            const formatted = JSON.stringify(nextObj, null, 2);
                                                            setBindingsEditorText(formatted);
                                                            setBindingsEditorError(null);
                                                            const baseParsed = parseJsonSafely(bindingsEditorBaseline);
                                                            if (!baseParsed.error) {
                                                                setBindingsEditorDirty(JSON.stringify(nextObj) !== JSON.stringify(baseParsed.value));
                                                            } else {
                                                                setBindingsEditorDirty(true);
                                                            }
                                                        }}
                                                    />
                                                    Enabled
                                                </label>
                                            ) : (
                                                <div style={{fontSize:'0.85em', color:'#888'}}>Enabled toggle unavailable (field missing).</div>
                                            )}
                                            {!bindingSchemaValidation.valid && bindingSchemaValidation.errors.length > 0 && (
                                                <div style={{marginTop:'6px', fontSize:'0.8em', color:'#c62828'}}>
                                                    {bindingSchemaValidation.errors.slice(0, 3).join('; ')}
                                                </div>
                                            )}
                                        </div>
                                        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'5px'}}>
                                            <strong style={{fontSize:'0.9em'}}>Binding Details</strong>
                                            <CopyBtn k="binding" text={selectedBinding} />
                                        </div>
                                        <pre style={preStyle}>{JSON.stringify(selectedBinding, null, 2)}</pre>
                                        <div style={{marginTop:'10px', border:'1px solid #ddd', borderRadius:'4px', overflow:'hidden'}}>
                                            <div style={{padding:'8px', background:'#f5f5f5', borderBottom:'1px solid #ddd', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                                <strong style={{fontSize:'0.9em'}}>Advanced JSON (Binding Data)</strong>
                                            </div>
                                            <div style={{padding:'8px'}}>
                                                <textarea
                                                    value={bindingsEditorText}
                                                    onChange={(e) => {
                                                        const nextText = e.target.value;
                                                        setBindingsEditorText(nextText);
                                                        const parsed = parseJsonSafely(nextText);
                                                        setBindingsEditorError(parsed.error);
                                                        if (!parsed.error) {
                                                            const baseParsed = parseJsonSafely(bindingsEditorBaseline);
                                                            if (!baseParsed.error) {
                                                                setBindingsEditorDirty(JSON.stringify(parsed.value) !== JSON.stringify(baseParsed.value));
                                                            } else {
                                                                setBindingsEditorDirty(true);
                                                            }
                                                        } else {
                                                            setBindingsEditorDirty(true);
                                                        }
                                                    }}
                                                    rows={10}
                                                    style={{width:'100%', resize:'vertical', padding:'8px', border:'1px solid #ccc', borderRadius:'4px', fontFamily:'monospace'}}
                                                />
                                                {!showActivateDraftModal && (
                                                    <div style={{marginTop:'6px', fontSize:'0.85em', color: bindingsEditorError ? '#c62828' : '#2e7d32'}}>
                                                        {bindingsEditorError ? `Invalid JSON: ${bindingsEditorError}` : 'Valid JSON'}
                                                    </div>
                                                )}
                                                <div style={{display:'flex', gap:'8px', marginTop:'10px'}}>
                                                    <button
                                                        onClick={handleSaveBindingsDraft}
                                                        disabled={!!bindingsEditorError || !bindingsEditorDirty || bindingsDraftSaving}
                                                        style={{cursor: (!!bindingsEditorError || !bindingsEditorDirty || bindingsDraftSaving) ? 'default' : 'pointer', padding:'4px 8px', fontSize:'0.85em'}}
                                                    >
                                                        {bindingsDraftSaving ? 'Saving Draft…' : 'Save Draft'}
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setBindingsEditorText(bindingsEditorBaseline);
                                                            setBindingsEditorError(null);
                                                            setBindingsEditorDirty(false);
                                                        }}
                                                        disabled={!bindingsEditorDirty}
                                                        style={{cursor: (!bindingsEditorDirty) ? 'default' : 'pointer', padding:'4px 8px', fontSize:'0.85em'}}
                                                    >
                                                        Reset
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            const parsed = parseJsonSafely(bindingsEditorText);
                                                            if (parsed.error || parsed.value === null) return;
                                                            const formatted = JSON.stringify(parsed.value, null, 2);
                                                            setBindingsEditorText(formatted);
                                                            setBindingsEditorError(null);
                                                            const baseParsed = parseJsonSafely(bindingsEditorBaseline);
                                                            if (!baseParsed.error) {
                                                                setBindingsEditorDirty(JSON.stringify(parsed.value) !== JSON.stringify(baseParsed.value));
                                                            }
                                                        }}
                                                        disabled={!!bindingsEditorError}
                                                        style={{cursor: (bindingsEditorError) ? 'default' : 'pointer', padding:'4px 8px', fontSize:'0.85em'}}
                                                    >
                                                        Format
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                 ) : (
                                    <div style={{fontStyle:'italic', color:'#666', padding:'10px'}}>Select a binding to view details.</div>
                                 )}
                             </div>
                         </div>
                     </div>
                 );
            }
            case 'Data': {
                if (!bundleData) return <div style={{padding:'20px', color:'#666'}}>No bundle/config loaded yet.</div>;

                if (dataBlocks.length === 0) {
                    return (
                        <div style={{padding:'20px', color:'#666'}}>
                            No data.* blocks found in the current bundle.
                        </div>
                    );
                }

                const selectedBlock = dataBlocks.find(b => b.blockId === selectedDataBlockId) || dataBlocks[0];
                const baseData = selectedBlock?.data ?? {};
                const baseObj = (baseData && typeof baseData === 'object') ? baseData as Record<string, unknown> : {};
                const derivedPatch = selectedBlock ? derivedPatches?.[selectedBlock.blockId] : undefined;
                const effectiveData = derivedPatch ? { ...baseObj, ...derivedPatch } : baseObj;
                const isDataStatic = selectedBlock?.blockType === 'data.static';
                const dataStaticSchema = blockSchemas['data.static'];
                const dataStaticSchemaError = blockSchemaErrors['data.static'];
                const dataFormValidation = dataStaticSchema
                    ? validateWithSchemaMinimal(dataStaticSchema, { value: dataStaticDraft })
                    : { valid: true, errors: [] as string[] };
                const dataJsonParsed = isDataStatic ? parseJsonSafely(dataStaticJsonText) : { value: null, error: null as string | null };
                const dataJsonValidation = dataStaticSchema && !dataJsonParsed.error
                    ? validateWithSchemaMinimal(dataStaticSchema, dataJsonParsed.value)
                    : { valid: true, errors: [] as string[] };
                const dataValueHelp = dataStaticSchema?.properties?.value?.['x-ui-editorHint']
                    || dataStaticSchema?.properties?.value?.description
                    || null;

                return (
                    <div style={{display:'flex', height:'100%', overflow:'hidden'}}>
                        {/* Left Column: data.* blocks list */}
                        <div style={{width:'260px', borderRight:'1px solid #ddd', background:'#f9f9f9', overflowY:'auto'}}>
                            <div style={{padding:'10px', borderBottom:'1px solid #eee', fontWeight:'bold', fontSize:'0.9em'}}>Data Blocks</div>
                            {dataBlocks.map(b => {
                                const isSel = b.blockId === selectedBlock.blockId;
                                return (
                                    <div
                                        key={b.blockId}
                                        onClick={() => setSelectedDataBlockId(b.blockId)}
                                        style={{
                                            padding:'8px 10px',
                                            cursor:'pointer',
                                            background: isSel ? '#e3f2fd' : 'transparent',
                                            color: isSel ? '#1565c0' : '#333',
                                            borderBottom:'1px solid #eee',
                                            fontSize:'0.9em'
                                        }}
                                    >
                                        <div style={{fontWeight:'bold'}}>{b.blockId}</div>
                                        <div style={{fontSize:'0.8em', color:'#666'}}>{b.blockType}</div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Right Column: Details */}
                        <div style={{flex:1, overflowY:'auto', padding:'10px'}}>
                            {derivedPatchesError && (
                                <div style={{padding:'8px', marginBottom:'10px', background:'#ffebee', color:'#c62828', fontSize:'0.9em', borderRadius:'4px', border:'1px solid #ffcdd2'}}>
                                    Warning: {derivedPatchesError}. Showing base config data only.
                                </div>
                            )}

                            <div style={{marginBottom:'15px', border:'1px solid #ddd', borderRadius:'4px'}}>
                                <div style={{padding:'8px', background:'#f5f5f5', borderBottom:'1px solid #ddd', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                    <span>
                                        <strong>Editable Value</strong>
                                        <span style={{marginLeft:'8px', fontSize:'0.85em', color:'#666'}}>(data.static only)</span>
                                    </span>
                                    <span style={{fontSize:'0.8em', color: dataStaticSchema ? (dataFormValidation.valid ? '#2e7d32' : '#c62828') : '#888'}}>
                                        {dataStaticSchema ? (dataFormValidation.valid ? 'Schema valid' : 'Schema invalid') : (dataStaticSchemaError || 'Schema unavailable')}
                                    </span>
                                </div>
                                <div style={{padding:'10px', display:'flex', flexDirection:'column', gap:'8px'}}>
                                    {isDataStatic ? (
                                        <>
                                            {dataValueHelp && (
                                                <div style={{fontSize:'0.8em', color:'#666'}}>{dataValueHelp}</div>
                                            )}
                                            <textarea
                                                value={dataStaticDraft}
                                                onChange={e => setDataStaticDraft(e.target.value)}
                                                rows={4}
                                                style={{width:'100%', resize:'vertical', padding:'8px', border:'1px solid #ccc', borderRadius:'4px', fontFamily:'inherit'}}
                                            />
                                            <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                                <button
                                                    onClick={handleSaveDataStatic}
                                                    disabled={dataStaticSaving || activateDraftSaving}
                                                    style={{padding:'6px 12px', cursor: (dataStaticSaving || activateDraftSaving) ? 'default' : 'pointer'}}
                                                >
                                                    {dataStaticSaving ? 'Saving…' : 'Save Draft'}
                                                </button>
                                                <button
                                                    onClick={() => { if (lastDraftVersionId) setShowActivateDraftModal(true); }}
                                                    disabled={!lastDraftVersionId || dataStaticSaving || activateDraftSaving}
                                                    style={{
                                                        padding:'6px 12px',
                                                        cursor: (!lastDraftVersionId || dataStaticSaving || activateDraftSaving) ? 'default' : 'pointer',
                                                        background: lastDraftVersionId ? '#e65100' : '#eee',
                                                        color: lastDraftVersionId ? '#fff' : '#888',
                                                        border: lastDraftVersionId ? '1px solid #e65100' : '1px solid #ccc',
                                                        borderRadius:'4px'
                                                    }}
                                                >
                                                    Activate Draft
                                                </button>
                                                {!showActivateDraftModal && (
                                                    <div style={{fontSize:'0.85em', color: dataStaticError ? '#c62828' : '#2e7d32'}}>
                                                        {dataStaticError || dataStaticStatus || ''}
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        <div style={{fontSize:'0.9em', color:'#666'}}>
                                            Read-only. Only data.static blocks are editable.
                                        </div>
                                    )}
                                </div>
                            </div>

                        <div style={{marginBottom:'15px', border:'1px solid #ddd', borderRadius:'4px', overflow:'hidden'}}>
                            <div style={{padding:'8px', background:'#f5f5f5', borderBottom:'1px solid #ddd', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                <strong>Advanced JSON (data.static)</strong>
                                <span style={{fontSize:'0.8em', color: dataJsonParsed.error ? '#c62828' : (dataJsonValidation.valid ? '#2e7d32' : '#c62828')}}>
                                    {dataJsonParsed.error
                                        ? `Invalid JSON: ${dataJsonParsed.error}`
                                        : dataStaticSchema
                                            ? (dataJsonValidation.valid ? 'Schema valid' : 'Schema invalid')
                                            : (dataStaticSchemaError || 'Schema unavailable')}
                                </span>
                            </div>
                            <div style={{padding:'10px'}}>
                                {isDataStatic ? (
                                    <>
                                        <textarea
                                            value={dataStaticJsonText}
                                            onChange={(e) => {
                                                const nextText = e.target.value;
                                                setDataStaticJsonText(nextText);
                                                const parsed = parseJsonSafely(nextText);
                                                setDataStaticJsonError(parsed.error);
                                                if (!parsed.error) {
                                                    const baseParsed = parseJsonSafely(dataStaticJsonBaseline);
                                                    if (!baseParsed.error) {
                                                        setDataStaticJsonDirty(JSON.stringify(parsed.value) !== JSON.stringify(baseParsed.value));
                                                    } else {
                                                        setDataStaticJsonDirty(true);
                                                    }
                                                    const nextValue = (parsed.value as any)?.value;
                                                    if (typeof nextValue === 'string') {
                                                        setDataStaticDraft(nextValue);
                                                    }
                                                } else {
                                                    setDataStaticJsonDirty(true);
                                                }
                                            }}
                                            rows={8}
                                            style={{width:'100%', resize:'vertical', padding:'8px', border:'1px solid #ccc', borderRadius:'4px', fontFamily:'monospace'}}
                                        />
                                        <div style={{display:'flex', gap:'8px', marginTop:'10px'}}>
                                            <button
                                                onClick={handleSaveDataStaticJson}
                                                disabled={!!dataStaticJsonError || !dataStaticJsonDirty || dataStaticSaving || activateDraftSaving}
                                                style={{padding:'6px 12px', cursor: (!!dataStaticJsonError || !dataStaticJsonDirty || dataStaticSaving || activateDraftSaving) ? 'default' : 'pointer'}}
                                            >
                                                {dataStaticSaving ? 'Saving…' : 'Save Draft (Advanced)'}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setDataStaticJsonText(dataStaticJsonBaseline);
                                                    setDataStaticJsonError(null);
                                                    setDataStaticJsonDirty(false);
                                                }}
                                                disabled={!dataStaticJsonDirty}
                                                style={{padding:'6px 12px', cursor: (!dataStaticJsonDirty) ? 'default' : 'pointer'}}
                                            >
                                                Reset
                                            </button>
                                            <button
                                                onClick={() => {
                                                    const parsed = parseJsonSafely(dataStaticJsonText);
                                                    if (parsed.error || parsed.value === null) return;
                                                    const formatted = JSON.stringify(parsed.value, null, 2);
                                                    setDataStaticJsonText(formatted);
                                                    setDataStaticJsonError(null);
                                                    const baseParsed = parseJsonSafely(dataStaticJsonBaseline);
                                                    if (!baseParsed.error) {
                                                        setDataStaticJsonDirty(JSON.stringify(parsed.value) !== JSON.stringify(baseParsed.value));
                                                    }
                                                }}
                                                disabled={!!dataStaticJsonError}
                                                style={{padding:'6px 12px', cursor: (dataStaticJsonError) ? 'default' : 'pointer'}}
                                            >
                                                Format
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <div style={{fontSize:'0.9em', color:'#666'}}>
                                        Read-only. Only data.static blocks are editable.
                                    </div>
                                )}
                            </div>
                        </div>

                            <div style={{marginBottom:'15px', border:'1px solid #ddd', borderRadius:'4px'}}>
                                <div style={{padding:'8px', background:'#f5f5f5', borderBottom:'1px solid #ddd', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                    <span>
                                        <strong>Base Data</strong>
                                        <span style={{marginLeft:'8px', fontSize:'0.85em', color:'#666'}}>({selectedBlock.blockType})</span>
                                    </span>
                                    <CopyBtn k="data_base" text={baseData} label="Copy Base" />
                                </div>
                                <div style={{padding:'10px'}}>
                                    <pre style={{...preStyle, margin:0, maxHeight:'200px', overflow:'auto'}}>
                                        {JSON.stringify(baseData, null, 2)}
                                    </pre>
                                </div>
                            </div>

                            <div style={{marginBottom:'15px', border:'1px solid #ddd', borderRadius:'4px'}}>
                                <div style={{padding:'8px', background:'#f5f5f5', borderBottom:'1px solid #ddd', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                    <span>
                                        <strong>Derived Patch</strong>
                                    </span>
                                    <CopyBtn k="data_patch" text={derivedPatch || {}} label="Copy Patch" />
                                </div>
                                <div style={{padding:'10px'}}>
                                    <pre style={{...preStyle, margin:0, maxHeight:'200px', overflow:'auto'}}>
                                        {JSON.stringify(derivedPatch || {}, null, 2)}
                                    </pre>
                                </div>
                            </div>

                            <div style={{marginBottom:'15px', border:'1px solid #ddd', borderRadius:'4px'}}>
                                <div style={{padding:'8px', background:'#f5f5f5', borderBottom:'1px solid #ddd', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                    <span>
                                        <strong>Effective Data</strong>
                                    </span>
                                    <CopyBtn k="data_effective" text={effectiveData} label="Copy Effective" />
                                </div>
                                <div style={{padding:'10px'}}>
                                    <pre style={{...preStyle, margin:0, maxHeight:'200px', overflow:'auto'}}>
                                        {JSON.stringify(effectiveData, null, 2)}
                                    </pre>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            }
            case 'Theme': {
                if (!bundleData) return <div style={{padding:'20px', color:'#666'}}>No bundle/config loaded yet.</div>;
                if (!themeTokensBlock) {
                    return (
                        <div style={{padding:'20px', color:'#666'}}>
                            No theme tokens block found (blockType: shell.infra.theme_tokens).
                        </div>
                    );
                }

                const themeSchema = blockSchemas['shell.infra.theme_tokens'];
                const themeSchemaError = blockSchemaErrors['shell.infra.theme_tokens'];
                const themeParsed = parseJsonSafely(themeTokensEditorText);
                const themeValidation = themeSchema && !themeParsed.error
                    ? validateWithSchemaMinimal(themeSchema, themeParsed.value)
                    : { valid: true, errors: [] as string[] };
                const canPatchThemeTokens = true;
                const canSaveThemeTokens = !!themeTokensEditorDirty
                    && !themeParsed.error
                    && (themeSchema ? themeValidation.valid : true);

                return (
                    <div style={{display:'flex', flexDirection:'column', height:'100%'}}>
                        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px'}}>
                            <div style={{fontWeight:'bold', fontSize:'0.9em'}}>Theme Tokens</div>
                            {!showActivateDraftModal && (
                                <div style={{fontSize:'0.8em', color:'#888'}}>
                                    Draft-enabled
                                </div>
                            )}
                        </div>
                        <div style={{border:'1px solid #ddd', borderRadius:'4px', overflow:'hidden'}}>
                            <div style={{padding:'8px', background:'#f5f5f5', borderBottom:'1px solid #ddd', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                <strong>Advanced JSON (Theme Tokens)</strong>
                                {!showActivateDraftModal && (
                                    <span style={{fontSize:'0.8em', color: themeParsed.error ? '#c62828' : (themeValidation.valid ? '#2e7d32' : '#c62828')}}>
                                        {themeParsed.error
                                            ? `Invalid JSON: ${themeParsed.error}`
                                            : themeSchema
                                                ? (themeValidation.valid ? 'Schema valid' : 'Schema invalid')
                                                : (themeSchemaError || 'Schema unavailable')}
                                    </span>
                                )}
                            </div>
                            <div style={{padding:'10px'}}>
                                <textarea
                                    value={themeTokensEditorText}
                                    onChange={(e) => {
                                        const nextText = e.target.value;
                                        setThemeTokensEditorText(nextText);
                                        const parsed = parseJsonSafely(nextText);
                                        setThemeTokensEditorError(parsed.error);
                                        if (!parsed.error) {
                                            const baseParsed = parseJsonSafely(themeTokensEditorBaseline);
                                            if (!baseParsed.error) {
                                                setThemeTokensEditorDirty(JSON.stringify(parsed.value) !== JSON.stringify(baseParsed.value));
                                            } else {
                                                setThemeTokensEditorDirty(true);
                                            }
                                        } else {
                                            setThemeTokensEditorDirty(true);
                                        }
                                    }}
                                    rows={12}
                                    style={{width:'100%', resize:'vertical', padding:'8px', border:'1px solid #ccc', borderRadius:'4px', fontFamily:'monospace'}}
                                />
                                {!themeValidation.valid && themeValidation.errors.length > 0 && !themeParsed.error && (
                                    <div style={{marginTop:'6px', fontSize:'0.8em', color:'#c62828'}}>
                                        {themeValidation.errors.slice(0, 3).join('; ')}
                                    </div>
                                )}
                                <div style={{display:'flex', gap:'8px', marginTop:'10px'}}>
                                    <button
                                        onClick={handleSaveThemeTokensDraft}
                                        disabled={!canPatchThemeTokens || !canSaveThemeTokens || themeTokensDraftSaving}
                                        style={{padding:'6px 12px', cursor: (!canPatchThemeTokens || !canSaveThemeTokens || themeTokensDraftSaving) ? 'default' : 'pointer'}}
                                    >
                                        {themeTokensDraftSaving ? 'Saving…' : 'Save Draft'}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setThemeTokensEditorText(themeTokensEditorBaseline);
                                            setThemeTokensEditorError(null);
                                            setThemeTokensEditorDirty(false);
                                        }}
                                        disabled={!themeTokensEditorDirty}
                                        style={{padding:'6px 12px', cursor: (!themeTokensEditorDirty) ? 'default' : 'pointer'}}
                                    >
                                        Reset
                                    </button>
                                    <button
                                        onClick={() => {
                                            const parsed = parseJsonSafely(themeTokensEditorText);
                                            if (parsed.error || parsed.value === null) return;
                                            const formatted = JSON.stringify(parsed.value, null, 2);
                                            setThemeTokensEditorText(formatted);
                                            setThemeTokensEditorError(null);
                                            const baseParsed = parseJsonSafely(themeTokensEditorBaseline);
                                            if (!baseParsed.error) {
                                                setThemeTokensEditorDirty(JSON.stringify(parsed.value) !== JSON.stringify(baseParsed.value));
                                            }
                                        }}
                                        disabled={!!themeTokensEditorError}
                                        style={{padding:'6px 12px', cursor: (themeTokensEditorError) ? 'default' : 'pointer'}}
                                    >
                                        Format
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            }
            case 'ActionIndex': {
                const selectedAction = selectedActionId 
                    ? allActions.find(a => a.id === selectedActionId) 
                    : null;
                const isSelectionStale = !!(selectedActionId && !selectedAction);

                return (
                    <div style={{display:'flex', flexDirection:'column', height:'100%'}}>
                         <div style={{fontSize:'0.85em', color:'#555', marginBottom:'5px'}}>
                             Total actions: <strong>{totalVisible}</strong> | Sources: <strong>{totalSources}</strong>
                         </div>
                         <input 
                            type="text" 
                            placeholder="Filter actions (id/name/source)..." 
                            value={filter} 
                            onChange={e=>setFilter(e.target.value)} 
                            style={{width:'100%', marginBottom:'10px', padding:'6px', boxSizing:'border-box', border:'1px solid #ccc'}}
                         />
                         
                         <div style={{display:'flex', flex:1, overflow:'hidden', gap:'10px'}}>
                             {/* Left Column: Groups & Lists */}
                             <div style={{flex: '0 0 45%', overflowY:'auto', borderRight:'1px solid #ddd', paddingRight:'5px'}}>
                                 {sortedKeys.map(k => (
                                     <div key={k} style={{marginBottom:'10px'}}>
                                         <div style={{
                                             fontWeight:'bold', 
                                             borderBottom:'1px solid #eee', 
                                             background:'#fafafa', 
                                             padding:'4px',
                                             fontSize:'0.9em',
                                             color:'#333'
                                         }}>
                                             {k} <span style={{fontWeight:'normal', fontSize:'0.8em', color:'#888'}}>({groupedActions.get(k)?.length})</span>
                                         </div>
                                         <div style={{paddingLeft:'5px'}}>
                                             {groupedActions.get(k)?.map((a: any) => {
                                                 const isSel = a.id === selectedActionId;
                                                 return (
                                                     <div 
                                                        key={a.id} 
                                                        onClick={() => setSelectedActionId(a.id)}
                                                        style={{
                                                            fontSize:'0.9em', 
                                                            padding:'4px 6px',
                                                            margin:'2px 0',
                                                            cursor:'pointer',
                                                            background: isSel ? '#e6f7ff' : 'transparent',
                                                            color: isSel ? '#007acc' : '#111',
                                                            borderLeft: isSel ? '3px solid #007acc' : '3px solid transparent'
                                                        }}
                                                        onMouseEnter={e => { if(!isSel) e.currentTarget.style.background = '#f5f5f5'; }}
                                                        onMouseLeave={e => { if(!isSel) e.currentTarget.style.background = 'transparent'; }}
                                                     >
                                                         {a.actionName}
                                                     </div>
                                                 );
                                             })}
                                         </div>
                                     </div>
                                 ))}
                                 {sortedKeys.length === 0 && <div style={{fontStyle:'italic', padding:'10px'}}>No matching actions.</div>}
                             </div>

                             {/* Right Column: Details */}
                             <div style={{flex:1, overflowY:'auto', paddingLeft:'5px'}}>
                                 {selectedAction ? (
                                    <>
                                        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'5px'}}>
                                            <strong style={{fontSize:'0.9em'}}>Action Details</strong>
                                            <CopyBtn k="action" text={selectedAction} />
                                        </div>
                                        <pre style={preStyle}>{JSON.stringify(selectedAction, null, 2)}</pre>
                                    </>
                                 ) : (
                                    <div style={{fontStyle:'italic', color:'#666', padding:'10px'}}>
                                        {isSelectionStale 
                                            ? <div>
                                                <span style={{color:'red'}}>Selected action not found.</span>
                                                <button onClick={() => setSelectedActionId(null)} style={{marginLeft:'8px', cursor:'pointer', fontSize:'0.9em', border:'1px solid #ccc', borderRadius:'3px'}}>Clear</button>
                                              </div>
                                            : "Select an action to view details."
                                        }
                                    </div>
                                 )}
                             </div>
                         </div>
                    </div>
                );
            }
            case 'Runtime': {
                if (!runtimePlan) return <div style={{padding:'20px', color:'#666'}}>Runtime not initialized.</div>;

                const openWindows = runtimePlan.windows ? Object.values(runtimePlan.windows) : [];
                const focusedId = runtimePlan.focusedWindowId ?? null;
                const availableWindows = runtimePlan.availableWindows || {};
                const savedLayoutExists = (() => {
                    try {
                        return !!localStorage.getItem('fole.windowLayout.v1');
                    } catch {
                        return false;
                    }
                })();

                return (
                    <div style={{display:'flex', flexDirection:'column', gap:'15px'}}>
                        <div style={{padding:'10px', background:'#fafafa', border:'1px solid #ddd', borderRadius:'4px'}}>
                            <div style={{fontWeight:'bold', marginBottom:'6px'}}>Window Definitions</div>
                            {Object.keys(availableWindows).length === 0 ? (
                                <div style={{fontStyle:'italic', color:'#777'}}>No window definitions registered.</div>
                            ) : (
                                <div style={{display:'flex', flexDirection:'column', gap:'6px'}}>
                                    {Object.entries(availableWindows).map(([id, def]) => {
                                        const isOpen = !!runtimePlan.windows?.[id];
                                        return (
                                            <div key={id} style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px', border:'1px solid #eee', background:'#fff'}}>
                                                <div>
                                                    <strong>{id}</strong>
                                                    {def?.title && def.title !== id && <span style={{marginLeft:'6px', color:'#666'}}>({def.title})</span>}
                                                </div>
                                                <button
                                                    onClick={() => { isOpen ? onFocusWindow(id) : onOpenWindow(id); }}
                                                    style={{cursor:'pointer', padding:'2px 8px', fontSize:'0.85em'}}
                                                >
                                                    {isOpen ? 'Focus' : 'Open'}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div style={{padding:'10px', background:'#fafafa', border:'1px solid #ddd', borderRadius:'4px'}}>
                            <div style={{fontWeight:'bold', marginBottom:'6px'}}>Open Windows</div>
                            {openWindows.length === 0 ? (
                                <div style={{fontStyle:'italic', color:'#777'}}>No windows are open.</div>
                            ) : (
                                <div style={{display:'flex', flexDirection:'column', gap:'6px'}}>
                                    {openWindows.map(w => (
                                        <div key={w.id} style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px', border:'1px solid #eee', background:'#fff'}}>
                                            <div>
                                                <strong>{w.id}</strong>
                                                {focusedId === w.id && <span style={{marginLeft:'6px', color:'#007acc'}}>(focused)</span>}
                                            </div>
                                            <div style={{display:'flex', gap:'6px'}}>
                                                <button onClick={() => onFocusWindow(w.id)} style={{cursor:'pointer', padding:'2px 8px', fontSize:'0.85em'}}>Focus</button>
                                                <button onClick={() => onCloseWindow(w.id)} style={{cursor:'pointer', padding:'2px 8px', fontSize:'0.85em'}}>Close</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div style={{padding:'10px', background:'#fafafa', border:'1px solid #ddd', borderRadius:'4px'}}>
                            <div style={{fontWeight:'bold', marginBottom:'6px'}}>Persistence</div>
                            <div style={{color:'#555', marginBottom:'6px'}}>
                                Saved layout: <strong>{savedLayoutExists ? 'present' : 'none'}</strong>
                            </div>
                            <div style={{display:'flex', gap:'8px'}}>
                                <button onClick={onResetWindowLayout} style={{cursor:'pointer', padding:'2px 8px', fontSize:'0.85em'}}>Reset Window Layout</button>
                                <button onClick={onCloseAllWindows} style={{cursor:'pointer', padding:'2px 8px', fontSize:'0.85em'}}>Close All Windows</button>
                            </div>
                            <div style={{marginTop:'6px', fontSize:'0.85em', color:'#666'}}>
                                Persisted across reloads; Reset clears it.
                            </div>
                        </div>

                        <div style={{padding:'10px', background:'#fff', border:'1px solid #eee', borderRadius:'4px', color:'#555'}}>
                            <div style={{fontWeight:'bold', marginBottom:'6px'}}>Runtime Behavior</div>
                            <div>Fetch Bundle registers config and definitions; does not open windows.</div>
                            <div>Windows open via explicit actions or runtime controls.</div>
                        </div>
                    </div>
                );
            }
            case 'Draft': {
                 if (!bundleData) return <div style={{padding:'20px', color:'#666'}}>Load active bundle first.</div>;

                 if (!draftBundle) {
                     return (
                         <div style={{padding:'40px', textAlign:'center', color:'#555'}}>
                             <h3>Draft Mode</h3>
                             <p>Create a draft from the current active configuration to start editing.</p>
                             {draftError && <div style={{color:'red', marginBottom:'10px'}}>{draftError}</div>}
                             <button 
                                onClick={handleCreateDraft}
                                style={{
                                    padding:'10px 20px', fontSize:'1em', background:'#007acc', color:'white', 
                                    border:'none', borderRadius:'4px', cursor:'pointer'
                                }}
                             >
                                Create Draft from Active
                             </button>
                         </div>
                     );
                 }

                 const draftBlocksMap = ((draftBundle as BundleResponse).blocks || {}) as Record<string, BundleBlock>;
                 const draftBlocksArr = (Object.values(draftBlocksMap) as BundleBlock[]).sort((a,b) => (a.blockId||a.id||'').localeCompare(b.blockId||b.id||''));
                 
                 const f = draftBlockFilter.toLowerCase();
                 const filtered = draftBlocksArr.filter(b => {
                     const bid = b.blockId || b.id || '';
                     const btype = b.blockType || '';
                     return !f || bid.toLowerCase().includes(f) || btype.toLowerCase().includes(f);
                 });
                 
                 const selectedBlock = draftSelectedBlockId ? draftBlocksMap[draftSelectedBlockId] : null;

                 const { status, errors, warnings } = validationResult;
                 const statusColors: Record<string,string> = { 
                     SAFE: '#2e7d32', 
                     WARNINGS: '#f57c00', 
                     BLOCKED: '#d32f2f',
                     'No draft': '#666'
                 };

                 return (
                     <div style={{display:'flex', flexDirection:'column', height:'100%', minHeight: 0}}>
                         {/* Status Strip (EPIC 2) */}
                         <div style={{
                             padding:'8px 12px', marginBottom:'15px', 
                             background: '#fafafa', borderBottom: '1px solid #ddd',
                             display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                             fontSize: '0.9em'
                         }}>
                             <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
                                 <div>
                                     <span style={{color:'#666', marginRight:'5px'}}>Running:</span>
                                     <span style={{
                                         fontWeight:'bold', 
                                         color: runningSource === 'ACTIVE' ? '#2e7d32' : '#f57c00',
                                         background: runningSource === 'ACTIVE' ? '#e8f5e9' : '#fff3e0',
                                         padding: '2px 6px', borderRadius: '4px', border: '1px solid',
                                         borderColor: runningSource === 'ACTIVE' ? '#c8e6c9' : '#ffe0b2'
                                     }}>
                                         {runningSource}
                                     </span>
                                 </div>
                                 <div style={{height:'16px', borderLeft:'1px solid #ccc'}}></div>
                                 <div>
                                    <span style={{color:'#666', marginRight:'5px'}}>Draft State:</span>
                                    <span style={{color:'#007acc', fontWeight:600}}>Present (local)</span>
                                 </div>
                                 <div style={{height:'16px', borderLeft:'1px solid #ccc'}}></div>
                                 <div>
                                     <span style={{color:'#666', marginRight:'5px'}}>Differs:</span>
                                     {(() => {
                                         const hasDiff = (draftDiff.added.length > 0 || draftDiff.removed.length > 0 || draftDiff.modified.length > 0 || draftDiff.manifestChanged);
                                         const isManifestOnly = draftDiff.manifestChanged && draftDiff.added.length === 0 && draftDiff.removed.length === 0 && draftDiff.modified.length === 0;
                                         
                                         if (isManifestOnly) {
                                             return <span style={{color:'#e65100', fontWeight:'bold'}}>YES (Manifest-only)</span>;
                                         }
                                         
                                         if (hasDiff) {
                                             return <span style={{color:'#d32f2f', fontWeight:'bold'}}>YES</span>;
                                         }
                                         
                                         return <span style={{color:'#999', fontWeight:'bold'}}>NO</span>;
                                     })()}
                                 </div>
                             </div>
                             
                             {lastConfigEvent && (
                                 <div style={{color:'#666', fontSize:'0.85em'}}>
                                     Last {lastConfigEvent.kind === 'APPLY' ? 'Apply' : 'Rollback'}: <b>{new Date(lastConfigEvent.ts).toLocaleTimeString()}</b>
                                 </div>
                             )}
                         </div>

                         {/* Validation Summary */}
                         <div style={{
                             padding:'10px', marginBottom:'10px', 
                             border:'1px solid #ccc', borderRadius:'4px',
                             background: status === 'SAFE' ? '#e8f5e9' : status === 'BLOCKED' ? '#ffebee' : '#fff3e0'
                         }}>
                             <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                                 <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                     <strong style={{fontSize:'1em'}}>Validation Summary</strong>
                                     <span style={{
                                         background: statusColors[status] || '#666',
                                         color: 'white', fontWeight:'bold',
                                         padding:'2px 8px', borderRadius:'4px', fontSize:'0.85em'
                                     }}>
                                         {status}
                                     </span>
                                     <span style={{fontSize:'0.9em', color:'#555'}}>
                                         {errors.length} Errors, {warnings.length} Warnings
                                     </span>
                                 </div>
                                 {(errors.length > 0 || warnings.length > 0) && (
                                     <button 
                                        onClick={() => setShowValidationDetails(!showValidationDetails)} 
                                        style={{
                                            color: '#111',
                                            background: '#ffffff',
                                            border: '1px solid #ccc',
                                            borderRadius: '6px',
                                            padding: '4px 10px',
                                            fontWeight: 600,
                                            fontSize: '0.85em',
                                            cursor: 'pointer'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = '#ffffff'}
                                     >
                                         {showValidationDetails ? 'Hide Details' : 'Show Details'}
                                     </button>
                                 )}
                             </div>
                             
                             {showValidationDetails && (errors.length > 0 || warnings.length > 0) && (
                                 <div style={{marginTop:'10px', maxHeight:'200px', overflowY:'auto', background:'white', padding:'8px', border:'1px solid #ddd'}}>
                                     {errors.length > 0 && (
                                         <div style={{marginBottom:'8px'}}>
                                             <div style={{fontWeight:'bold', color:'#d32f2f', marginBottom:'2px', fontSize:'0.9em'}}>Errors</div>
                                             <ul style={{margin:0, paddingLeft:'20px', color:'#d32f2f', fontSize:'0.9em'}}>
                                                 {errors.map((e, i) => <li key={'e'+i}>{e}</li>)}
                                             </ul>
                                         </div>
                                     )}
                                     {warnings.length > 0 && (
                                         <div>
                                             <div style={{fontWeight:'bold', color:'#ef6c00', marginBottom:'2px', fontSize:'0.9em'}}>Warnings</div>
                                             <ul style={{margin:0, paddingLeft:'20px', color:'#ef6c00', fontSize:'0.9em'}}>
                                                 {warnings.map((w, i) => <li key={'w'+i}>{w}</li>)}
                                             </ul>
                                         </div>
                                     )}
                                 </div>
                             )}
                             <div style={{marginTop:'5px', fontSize:'0.8em', color:'#666'}}>
                                 Apply is disabled in this phase. This summary is informational only.
                             </div>
                         </div>

                         {/* Draft Integrity Panel */}
                         <div style={{
                             padding:'10px', marginBottom:'10px', 
                             border:'1px solid #ffcc80', borderRadius:'4px',
                             background: '#fff3e0'
                         }}>
                             <div style={{fontWeight:'bold', marginBottom:'5px', color:'#e65100', fontSize:'1em'}}>Draft Integrity</div>
                             {draftIntegrityIssues.length === 0 ? (
                                 <div style={{color:'#2e7d32', fontSize:'0.9em', fontStyle:'italic'}}>
                                     No broken binding references detected.
                                 </div>
                             ) : (
                                 <div>
                                     <div style={{fontSize:'0.9em', color:'#e65100', marginBottom:'5px', fontWeight:'bold'}}>
                                         {draftIntegrityIssues.length} broken reference{draftIntegrityIssues.length !== 1 ? 's' : ''} detected:
                                     </div>
                                     <div style={{display:'flex', flexDirection:'column', gap:'4px', maxHeight:'150px', overflowY:'auto'}}>
                                         {draftIntegrityIssues.map((issue, idx) => (
                                             <div key={idx} style={{
                                                 display:'flex', justifyContent:'space-between', alignItems:'center',
                                                 background:'white', padding:'4px 8px', borderRadius:'3px', border:'1px solid #ffe0b2',
                                                 fontSize:'0.85em'
                                             }}>
                                                 <div style={{display:'flex', flexDirection:'column', gap:'2px'}}>
                                                     <span style={{color:'#333'}}>{issue.details}</span>
                                                     <div style={{display:'flex', alignItems:'center', gap:'5px', color:'#777', fontSize:'0.9em', fontFamily:'monospace'}}>
                                                        <span>Path: {issue.jsonPath}</span>
                                                        <CopyBtn k={`path-${idx}`} text={issue.jsonPath} label="Copy Path" />
                                                     </div>
                                                 </div>
                                                 <button
                                                     onClick={() => handleGoToIntegrity(issue.bindingId, issue.jsonPath)}
                                                     style={{
                                                         background:'none', border:'none', color:'#007acc', 
                                                         cursor:'pointer', textDecoration:'underline', fontWeight:'bold',
                                                         padding:'0 5px'
                                                     }}
                                                 >
                                                     Go to
                                                 </button>
                                             </div>
                                         ))}
                                     </div>
                                 </div>
                             )}
                         </div>

                         {/* Apply Preview Section (Safety Kit) */}
                         <div style={{
                             marginBottom:'10px', padding:'10px', 
                             border:'1px solid #ccc', borderRadius:'4px',
                             background: '#f8f9fa'
                         }}>
                             <div style={{fontWeight:'bold', marginBottom:'5px', color:'#333'}}>Apply Preview</div>
                             <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                                 <div style={{fontSize:'0.9em', color:'#444'}}>
                                     <div style={{marginBottom:'3px'}}>
                                         <strong>Status: </strong>
                                         {status === 'BLOCKED' ? <span style={{color:'#d32f2f', fontWeight:'bold'}}>Not eligible (BLOCKED)</span> :
                                          status === 'WARNINGS' ? <span style={{color:'#f57c00', fontWeight:'bold'}}>Eligible with warnings {ackWarnings ? '(acknowledged)' : '(ack required)'}</span> :
                                          status === 'SAFE' ? <span style={{color:'#2e7d32', fontWeight:'bold'}}>Eligible (SAFE)</span> :
                                          <span>{status}</span>}
                                     </div>
                                     <div style={{marginBottom:'3px'}}>
                                         <strong>Changes: </strong>
                                         {(() => {
                                             const isManifestOnly = draftDiff.manifestChanged && draftDiff.added.length === 0 && draftDiff.removed.length === 0 && draftDiff.modified.length === 0;
                                             
                                             if (isManifestOnly) {
                                                 return <span style={{color:'#e65100', fontWeight:'bold'}}>Manifest (no block data changes)</span>;
                                             }

                                             if (draftDiff.added.length > 0 || draftDiff.removed.length > 0 || draftDiff.modified.length > 0 || draftDiff.manifestChanged) {
                                                 return (
                                                     <span>
                                                         {draftDiff.added.length > 0 && <span style={{color:'#2e7d32', marginRight:'8px'}}>+{draftDiff.added.length} Add</span>}
                                                         {draftDiff.removed.length > 0 && <span style={{color:'#d32f2f', marginRight:'8px'}}>-{draftDiff.removed.length} Del</span>}
                                                         {draftDiff.modified.length > 0 && <span style={{color:'#f57c00', marginRight:'8px'}}>~{draftDiff.modified.length} Mod</span>}
                                                         {draftDiff.manifestChanged && <span style={{color:'#e65100', fontWeight:'bold'}}>Manifest</span>}
                                                     </span>
                                                 );
                                             }
                                             
                                             return <span style={{color:'#999', fontStyle:'italic'}}>No differences (matches Active)</span>;
                                         })()}
                                     </div>
                                     
                                     {draftDiff.manifestChanged && draftDiff.added.length === 0 && draftDiff.removed.length === 0 && draftDiff.modified.length === 0 && (
                                         <div style={{fontSize:'0.85em', color:'#e65100', marginTop:'2px', fontStyle:'italic'}}>
                                             This update only affects manifest structure. No block content will change.
                                         </div>
                                     )}

                                     {draftDiff.manifestChanged && ['top','main','bottom'].some(k => (bundleData as any)?.manifest?.regions?.[k]) && (
                                         <div style={{fontSize:'0.85em', color:'#666', marginTop:'2px', fontStyle:'italic'}}>
                                             Note: Active uses legacy keys; Draft is canonicalized.
                                         </div>
                                     )}
                                     
                                     {/* Warning Acknowledgement Checkbox */}
                                     {status === 'WARNINGS' && (
                                         <div style={{marginTop:'5px', padding:'4px', background:'#fff3e0', border:'1px solid #ffe0b2', borderRadius:'3px'}}>
                                             <label style={{display:'flex', alignItems:'center', cursor:'pointer', fontSize:'0.9em'}}>
                                                 <input 
                                                     type="checkbox" 
                                                     checked={ackWarnings} 
                                                     onChange={e => setAckWarnings(e.target.checked)}
                                                     style={{marginRight:'6px'}}
                                                 />
                                                 I understand the warnings and wish to proceed.
                                             </label>
                                         </div>
                                     )}

                                     {selectedBlock && draftDiff.modified.includes(selectedBlock.blockId) && (
                                         <div style={{fontStyle:'italic', color:'#555', marginTop:'5px'}}>
                                             * Selected block "{selectedBlock.blockId}" has pending changes.
                                         </div>
                                     )}
                                 </div>

                                 <div style={{textAlign:'right', display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'5px'}}>
                                     {canRollback && (
                                        <div style={{fontSize:'0.8em', color:'#d32f2f', marginBottom:'2px'}}>
                                            Rollback available (restores last ACTIVE snapshot)
                                        </div>
                                     )}
                                     
                                     {(() => {
                                         const hasDiff = !!draftDiff && (draftDiff.added.length > 0 || draftDiff.removed.length > 0 || draftDiff.modified.length > 0 || draftDiff.manifestChanged);
                                         const validStatus = status === 'SAFE' || (status === 'WARNINGS' && ackWarnings);
                                         const disabledReason = !hasDiff ? "No changes to apply" : 
                                                                status === 'BLOCKED' ? "Validation BLOCKED" : 
                                                                (status === 'WARNINGS' && !ackWarnings) ? "Warnings acknowledgement required" : 
                                                                null;
                                         
                                         const canApply = hasDiff && validStatus;
                                         
                                         // Style derivation
                                         let applyBg = '#e0e0e0';
                                         let applyBorder = '#ccc';
                                         
                                         if (canApply) {
                                             if (confirmApply) {
                                                 applyBg = '#e65100'; 
                                                 applyBorder = '#e65100';
                                             } else {
                                                 applyBg = '#2e7d32'; 
                                                 applyBorder = '#1b5e20';
                                             }
                                         }
                                         
                                         return (
                                             <div style={{display:'flex', gap:'5px'}}>
                                                <button 
                                                    disabled={!canRollback} 
                                                    onClick={() => {
                                                        setConfirmModal({
                                                            isOpen: true,
                                                            title: "Rollback?",
                                                            message: "Rollback to last ACTIVE bundle? This will reinitialize runtime.",
                                                            onConfirm: () => {
                                                                onRollback();
                                                                setConfirmModal((p:any) => ({...p, isOpen: false}));
                                                            }
                                                        });
                                                    }}
                                                    style={{
                                                        background: canRollback ? '#f44336' : '#f5f5f5', 
                                                        color: canRollback ? 'white' : 'gray', 
                                                        border: canRollback ? '1px solid #d32f2f' : '1px solid #ccc',
                                                        padding:'6px 10px', borderRadius:'4px', 
                                                        cursor: canRollback ? 'pointer' : 'not-allowed', 
                                                        fontSize:'0.9em',
                                                        fontWeight: 'bold'
                                                    }}
                                                    title="Rollback will restore last active snapshot."
                                                >
                                                    Rollback
                                                </button>
                                                <button 
                                                    disabled={!canApply} 
                                                    onClick={() => {
                                                        if (!confirmApply) {
                                                            setConfirmApply(true);
                                                            return;
                                                        }
                                                        onApplyDraft(draftBundle as BundleResponse);
                                                        setConfirmApply(false);
                                                    }}
                                                    style={{
                                                        background: applyBg,
                                                        color: 'white',
                                                        padding: '6px 14px',
                                                        border: `1px solid ${applyBorder}`,
                                                        borderRadius: '4px',
                                                        cursor: canApply ? 'pointer' : 'not-allowed',
                                                        fontWeight: 'bold',
                                                        opacity: canApply ? 1 : 0.6,
                                                        minWidth: '100px'
                                                    }}
                                                    title={disabledReason || "Apply Draft to Runtime"}
                                                >
                                                    {confirmApply ? "Confirm Apply" : "Apply Draft"}
                                                </button>
                                             </div>
                                         );
                                     })()}

                                     <div style={{fontSize:'0.75em', color:'#666', maxWidth:'250px'}}>
                                         {confirmApply 
                                            ? <span style={{color:'#e65100', fontWeight:'bold'}}>Click again to execute replacement.</span>
                                            : "Runtime will re-initialize immediately."}
                                     </div>
                                 </div>
                             </div>
                         </div>

                         {/* Draft Toolbar */}
                         <div style={{paddingBottom:'10px', marginBottom:'10px', borderBottom:'1px solid #ccc', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                             <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
                                 <strong style={{color:'#007acc'}}>Draft Active</strong>
                                 <span style={{fontSize:'0.9em', color:'#555'}}>
                                     Added: <b>{draftDiff.added.length}</b> | Removed: <b>{draftDiff.removed.length}</b> | Modified: <b>{draftDiff.modified.length}</b>
                                     {draftDiff.manifestChanged && <span style={{marginLeft:'10px', color:'#ef6c00', fontWeight:'bold'}}>(Manifest Changed)</span>}
                                 </span>
                                 <span style={{fontSize:'0.8em', color:'#999', fontStyle:'italic'}}>
                                     (Saved locally)
                                 </span>
                             </div>
                             <div style={{display:'flex', gap:'10px', alignItems:'center'}}>

                                <button 
                                    onClick={handleActivateDraftDeploy}
                                    disabled={pendingStage === 'saving'}
                                    style={{
                                        padding:'4px 10px', fontSize:'0.9em', 
                                        background: pendingStage === 'saving' ? '#ffcc80' : '#e65100', 
                                        color:'white', 
                                        border:'none', borderRadius:'4px', cursor:'pointer',
                                        fontWeight: 'bold'
                                    }}
                                    title="Save to server and activate as new version"
                                >
                                    {pendingStage === 'saving' ? 'Deploying...' : 'Activate (Deploy)'}
                                </button>
                                <button 
                                    onClick={handleResetDraft}
                                    style={{padding:'4px 10px', fontSize:'0.9em', background:'#d32f2f', color:'white', border:'none', borderRadius:'4px', cursor:'pointer'}}
                                >
                                    Discard Draft
                                </button>
                                <button 
                                    onClick={handleRebaseDraft}
                                    style={{padding:'4px 10px', fontSize:'0.9em', background:'#f57f17', color:'white', border:'none', borderRadius:'4px', cursor:'pointer', fontWeight:'bold'}}
                                    title="Replace draft with current Active Bundle (Fixes stale missing blocks)"
                                >
                                    Reset Draft from Active
                                </button>
                             </div>
                         </div>
                         
                         <div style={{display:'flex', flex:1, width:'100%', overflow:'hidden', gap:'10px', minHeight: 0}}>
                             {/* Left: Block List */}
                             <div style={{flex: '0 0 260px', display:'flex', flexDirection:'column', borderRight:'1px solid #ddd', paddingRight:'5px', overflowY:'auto', minHeight: 0}}>
                                 
                                 {/* Regions Editor */}
                                 <div style={{marginBottom:'10px', paddingBottom:'10px', borderBottom:'1px solid #eee'}}>
                                     <div style={{fontWeight:'bold', marginBottom:'5px', color:'#333', fontSize:'0.9em'}}>Shell Regions (Draft)</div>
                                     {(['header', 'viewport', 'footer'] as RegionSlot[]).map(slot => {
                                         const regions = (draftBundle as any).manifest?.regions || {};
                                         const current = regions[slot]?.blockId || '';
                                         const label = slot.charAt(0).toUpperCase() + slot.slice(1);
                                         
                                         return (
                                             <div key={slot} style={{marginBottom:'5px', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                                                 <span style={{fontSize:'0.85em', color:'#555', width:'55px'}}>{label}</span>
                                                 <select 
                                                     value={current} 
                                                     onChange={(e) => handleRegionChange(slot, e.target.value)}
                                                     style={{fontSize:'0.8em', flex:1, padding:'2px', border:'1px solid #ccc', borderRadius:'3px', maxWidth:'200px'}}
                                                 >
                                                     <option value="">(none)</option>
                                                     {draftBlocksArr.map(b => {
                                                         const bid = b.blockId || b.id;
                                                         return <option key={bid} value={bid}>{bid}</option>;
                                                     })}
                                                 </select>
                                             </div>
                                         );
                                     })}
                                 </div>


                                 {/* Integrations (Draft) */}
                                 <div style={{marginBottom:'10px', paddingBottom:'10px', borderBottom:'1px solid #eee'}}>
                                     <div style={{fontWeight:'bold', marginBottom:'5px', color:'#333', fontSize:'0.9em'}}>Integrations (Draft)</div>
                                     {(() => {
                                         const blocksMap = (draftBundle as any).blocks || {};
                                         const integrations = Object.values(blocksMap).filter((b: any) => 
                                             (b.blockType || '').startsWith('shell.infra.api.') || (b.blockType || '').startsWith('shell.infra.db.')
                                         ) as any[];
                                         
                                         return (
                                             <div>
                                                 <div style={{maxHeight:'150px', overflowY:'auto', overflowX:'hidden', marginBottom:'5px', border:'1px solid #f0f0f0'}}>
                                                     {integrations.length === 0 && <div style={{fontStyle:'italic', color:'#999', fontSize:'0.8em', padding:'4px'}}>No integrations found.</div>}
                                                     {integrations.map((item, i) => {
                                                         const bid = item.blockId;
                                                         return (
                                                             <div key={bid || i} style={{display:'flex', alignItems:'center', gap:'4px', padding:'2px 0', fontSize:'0.85em', borderBottom:'1px dashed #eee'}}>
                                                                 <div style={{flex:1, overflow:'hidden'}}>
                                                                     <div style={{fontWeight:'bold', width:'100%', overflow:'hidden', textOverflow:'ellipsis'}} title={bid}>{bid}</div>
                                                                     <div style={{fontSize:'0.8em', color:'#666', width:'100%', overflow:'hidden', textOverflow:'ellipsis'}} title={item.blockType}>{item.blockType}</div>
                                                                 </div>
                                                                 <button 
                                                                     onClick={() => handleDraftSelectBlock(bid)}
                                                                     style={{background:'none', border:'1px solid #ccc', borderRadius:'3px', color:'#007acc', cursor:'pointer', fontSize:'0.8em', padding:'1px 4px'}}
                                                                     title="Go to block"
                                                                 >
                                                                     Go
                                                                 </button>
                                                                 <button 
                                                                     onClick={() => handleDuplicateDraftBlock(bid)}
                                                                     style={{background:'none', border:'1px solid #ccc', borderRadius:'3px', color:'#333', cursor:'pointer', fontSize:'0.8em', padding:'1px 4px'}}
                                                                     title="Duplicate"
                                                                 >
                                                                     Dup
                                                                 </button>
                                                             </div>
                                                         );
                                                     })}
                                                 </div>
                                                 <div style={{display:'flex', flexDirection:'column', gap:'5px', marginTop:'5px'}}>
                                                     <div>
                                                         <label style={{fontSize:'0.75em', fontWeight:'bold', display:'block', marginBottom:'2px', color:'#555'}}>Integration ID</label>
                                                         <input 
                                                             type="text" 
                                                             value={newIntegrationId} 
                                                             onChange={(e) => setNewIntegrationId(e.target.value)}
                                                             style={{width:'100%', fontSize:'0.8em', padding:'4px', border:'1px solid #ccc', boxSizing:'border-box'}}
                                                             placeholder="e.g. api_main"
                                                         />
                                                     </div>
                                                     <div>
                                                         <label style={{fontSize:'0.75em', fontWeight:'bold', display:'block', marginBottom:'2px', color:'#555'}}>Integration Type</label>
                                                         <select 
                                                             value={newIntegrationType} 
                                                             onChange={(e) => setNewIntegrationType(e.target.value)}
                                                             style={{width:'100%', fontSize:'0.8em', padding:'4px', border:'1px solid #ccc', boxSizing:'border-box'}}
                                                         >
                                                             <option value="shell.infra.api.http">HTTP API (shell.infra.api.http)</option>
                                                             <option value="shell.infra.db.postgres">PostgreSQL DB (shell.infra.db.postgres)</option>
                                                             <option value="shell.infra.db.sqlite">SQLite DB (shell.infra.db.sqlite)</option>
                                                         </select>
                                                     </div>
                                                     <button 
                                                         onClick={handleCreateIntegration}
                                                         disabled={!newIntegrationId}
                                                         style={{
                                                             marginTop:'5px',
                                                             background: newIntegrationId ? '#007acc' : '#ccc', 
                                                             color:'white', border:'none', borderRadius:'3px', 
                                                             cursor: newIntegrationId ? 'pointer' : 'not-allowed', 
                                                             fontSize:'0.9em', padding:'4px 8px', fontWeight:'bold', width:'100%'
                                                         }}
                                                     >
                                                         Create Integration
                                                     </button>
                                                     <div style={{fontSize:'0.75em', color:'#888', fontStyle:'italic', textAlign:'center', marginTop:'2px'}}>
                                                         Config-only (no backend calls yet)
                                                     </div>
                                                 </div>
                                             </div>
                                         );
                                     })()}
                                 </div>

                                 {/* Windows Registry (Draft) */}
                                 <div style={{marginBottom:'10px', paddingBottom:'10px', borderBottom:'1px solid #eee'}}>
                                     <div style={{fontWeight:'bold', marginBottom:'5px', color:'#333', fontSize:'0.9em'}}>Windows Registry (Draft)</div>
                                     {(() => {
                                         const blocks = (draftBundle as any).blocks || {};
                                         const infra = blocks['window_registry'] || blocks['infra_windows'];
                                         if (!infra || infra.blockType !== 'shell.infra.window_registry') {
                                             return <div style={{color:'#d32f2f', fontSize:'0.8em'}}>Missing 'window_registry' block.</div>;
                                         }
                                         
                                         const windows = infra.data?.windows || {};
                                         const winIds = Object.keys(windows).sort();

                                         return (
                                            <div>
                                                <div style={{maxHeight:'150px', overflowY:'auto', overflowX:'hidden', marginBottom:'5px', border:'1px solid #f0f0f0'}}>
                                                    {winIds.map(wid => {
                                                        const w = windows[wid];
                                                        const mode = w.mode || 'singleton';
                                                        return (
                                                            <div key={wid} style={{display:'flex', alignItems:'center', gap:'4px', padding:'2px', fontSize:'0.85em'}}>
                                                                <div style={{width:'70px', overflow:'hidden', textOverflow:'ellipsis', fontWeight:'bold'}} title={wid}>{wid}</div>
                                                                <select 
                                                                    value={mode}
                                                                    onChange={(e) => handleUpdateWindowMode(wid, e.target.value)}
                                                                    style={{flex:1, border:'1px solid #ccc', borderRadius:'3px', fontSize:'0.9em', padding:'1px'}}
                                                                >
                                                                    <option value="singleton">singleton</option>
                                                                    <option value="multi">multi</option>
                                                                    {!['singleton','multi'].includes(mode) && <option value={mode}>(current: {mode})</option>}
                                                                </select>
                                                                <button 
                                                                    onClick={() => handleRemoveWindow(wid)}
                                                                    style={{background:'none', border:'none', color:'#d32f2f', cursor:'pointer', fontWeight:'bold', fontSize:'1.1em', lineHeight:'1em'}}
                                                                    title="Remove Window"
                                                                >
                                                                    ×
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                <div style={{display:'flex', gap:'5px', alignItems:'center'}}>
                                                    <input
                                                        type="text"
                                                        placeholder="New ID..."
                                                        value={newWinId}
                                                        onChange={(e) => setNewWinId(e.target.value)}
                                                        style={{width:'60px', fontSize:'0.8em', padding:'2px', border:'1px solid #ccc'}}
                                                    />
                                                    <select 
                                                        value={newWinMode} 
                                                        onChange={(e) => setNewWinMode(e.target.value)}
                                                        style={{width:'65px', fontSize:'0.8em', padding:'2px', border:'1px solid #ccc'}}
                                                    >
                                                        <option value="singleton">Single</option>
                                                        <option value="multi">Multi</option>
                                                    </select>
                                                    <button 
                                                        onClick={handleAddWindow}
                                                        disabled={!newWinId}
                                                        style={{background: newWinId ? '#007acc' : '#ccc', color:'white', border:'none', borderRadius:'3px', cursor:'pointer', fontSize:'0.9em', padding:'2px 6px'}}
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                            </div>
                                         );
                                     })()}
                                 </div>

                                 {/* Overlay Blocks (Draft) */}
                                 <div style={{marginBottom:'10px', paddingBottom:'10px', borderBottom:'1px solid #eee'}}>
                                     <div style={{fontWeight:'bold', marginBottom:'5px', color:'#333', fontSize:'0.9em'}}>Overlay Blocks (Draft)</div>
                                     {(() => {
                                         const blocksMap = (draftBundle as any).blocks || {};
                                         const overlays = Object.values(blocksMap).filter((b: any) => 
                                             (b.blockType || '').includes('overlay') || (b.blockId || '').startsWith('overlay_')
                                         ) as any[];
                                         
                                         return (
                                             <div>
                                                 <div style={{maxHeight:'150px', overflowY:'auto', overflowX:'hidden', marginBottom:'5px', border:'1px solid #f0f0f0'}}>
                                                     {overlays.length === 0 && <div style={{fontStyle:'italic', color:'#999', fontSize:'0.8em', padding:'4px'}}>No overlay blocks found.</div>}
                                                     {overlays.map((ov, i) => {
                                                         const bid = ov.blockId;
                                                         return (
                                                             <div key={bid || i} style={{display:'flex', alignItems:'center', gap:'4px', padding:'2px 0', fontSize:'0.85em', borderBottom:'1px dashed #eee'}}>
                                                                 <div style={{flex:1, overflow:'hidden'}}>
                                                                     <div style={{fontWeight:'bold', width:'100%', overflow:'hidden', textOverflow:'ellipsis'}} title={bid}>{bid}</div>
                                                                     <div style={{fontSize:'0.8em', color:'#666', width:'100%', overflow:'hidden', textOverflow:'ellipsis'}} title={ov.blockType}>{ov.blockType}</div>
                                                                 </div>
                                                                 <button 
                                                                     onClick={() => handleDraftSelectBlock(bid)}
                                                                     style={{background:'none', border:'1px solid #ccc', borderRadius:'3px', color:'#007acc', cursor:'pointer', fontSize:'0.8em', padding:'1px 4px'}}
                                                                     title="Go to block"
                                                                 >
                                                                     Go
                                                                 </button>
                                                                 <button 
                                                                     onClick={() => handleDuplicateDraftBlock(bid)}
                                                                     style={{background:'none', border:'1px solid #ccc', borderRadius:'3px', color:'#333', cursor:'pointer', fontSize:'0.8em', padding:'1px 4px'}}
                                                                     title="Duplicate"
                                                                 >
                                                                     Dup
                                                                 </button>
                                                             </div>
                                                         );
                                                     })}
                                                 </div>
                                                 <div style={{display:'flex', flexDirection:'column', gap:'5px', marginTop:'5px'}}>
                                                     <div style={{display:'flex', gap:'5px'}}>
                                                         <input 
                                                             type="text" 
                                                             value={newOverlayId} 
                                                             onChange={(e) => setNewOverlayId(e.target.value)}
                                                             style={{flex:1, fontSize:'0.8em', padding:'2px', border:'1px solid #ccc'}}
                                                             placeholder="New ID"
                                                         />
                                                     </div>
                                                     <div style={{display:'flex', gap:'5px'}}>
                                                         <select 
                                                             value={newOverlayType}
                                                             onChange={(e) => setNewOverlayType(e.target.value)}
                                                             style={{flex:1, fontSize:'0.8em', padding:'2px', border:'1px solid #ccc'}}
                                                         >
                                                             <option value="shell.overlay.main_menu">main_menu</option>
                                                             <option value="shell.overlay.modal">modal</option>
                                                             <option value="shell.overlay.panel">panel</option>
                                                             {/* User can technically type others if we gave a text input, but dropdown is safer for now */}
                                                         </select>
                                                         <button 
                                                             onClick={handleCreateOverlay}
                                                             disabled={!newOverlayId}
                                                             style={{background: newOverlayId ? '#007acc' : '#ccc', color:'white', border:'none', borderRadius:'3px', cursor:'pointer', fontSize:'0.9em', padding:'2px 8px'}}
                                                         >
                                                             Create
                                                         </button>
                                                     </div>
                                                 </div>
                                             </div>
                                         );
                                     })()}
                                 </div>

                                 <input 
                                    type="text" 
                                    placeholder="Filter draft blocks..." 
                                    value={draftBlockFilter} 
                                    onChange={e=>setDraftBlockFilter(e.target.value)} 
                                    style={{width:'100%', marginBottom:'10px', padding:'6px', boxSizing:'border-box', border:'1px solid #ccc'}}
                                 />
                                 <div>
                                     {filtered.map((b, i) => {
                                         const bid = b.blockId || b.id || `draft-block-${i}`;
                                         const isSel = bid === draftSelectedBlockId;
                                         
                                         // Status Badge logic
                                         let batchStatus = null;
                                         if (draftDiff.added.includes(bid)) batchStatus = 'ADDED';
                                         else if (draftDiff.modified.includes(bid)) batchStatus = 'MODIFIED';

                                         return (
                                            <div 
                                                key={bid} 
                                                onClick={() => handleDraftSelectBlock(bid)}
                                                style={{
                                                    border: isSel ? '1px solid #007acc' : '1px solid #ddd', 
                                                    background: isSel ? '#e6f7ff' : 'white',
                                                    padding:'6px', 
                                                    marginBottom:'5px', 
                                                    cursor:'pointer',
                                                    fontSize:'0.9em',
                                                    display:'flex', justifyContent:'space-between', alignItems:'center'
                                                }}
                                            >
                                                <div>
                                                    <div style={{fontWeight:'bold', color:'#222'}}>{bid}</div>
                                                    <div style={{fontSize:'0.85em', color:'#555'}}>{b.blockType}</div>
                                                </div>
                                                {batchStatus && (
                                                    <span style={{
                                                        fontSize:'0.7em', fontWeight:'bold', 
                                                        color:'white', padding:'2px 4px', borderRadius:'3px',
                                                        background: batchStatus === 'ADDED' ? '#2e7d32' : '#f57c00'
                                                    }}>
                                                        {batchStatus}
                                                    </span>
                                                )}
                                            </div>
                                         );
                                     })}
                                     {filtered.length === 0 && <div style={{fontStyle:'italic', padding:'10px'}}>No matching blocks.</div>}
                                 </div>
                             </div>
                             
                             {/* Right: Editor */}
                             <div style={{flex:1, minWidth:0, overflow:'auto', display:'flex', flexDirection:'column', paddingLeft:'5px', minHeight: 0}}>
                                 {selectedBlock ? (
                                     <>
                                         <div style={{marginBottom:'10px', borderBottom:'1px solid #eee', paddingBottom:'5px'}}>
                                             <div style={{fontWeight:'bold', fontSize:'1em'}}>{selectedBlock.blockId}</div>
                                             <div style={{fontSize:'0.8em', color:'#666'}}>
                                                 Type: {selectedBlock.blockType} | Schema: {selectedBlock.schemaVersion || 'v1'}
                                                 {draftDiff.modified.includes(selectedBlock.blockId) && <span style={{color:'#f57c00', marginLeft:'10px', fontWeight:'bold'}}>MODIFIED (Data changed)</span>}
                                                 {draftDiff.added.includes(selectedBlock.blockId) && <span style={{color:'#2e7d32', marginLeft:'10px', fontWeight:'bold'}}>NEW BLOCK</span>}
                                                 {draftEditorDirty && <span style={{color:'#d32f2f', marginLeft:'10px', fontWeight:'bold'}}>Unsaved changes</span>}
                                             </div>
                                         </div>
                                         
                                         {draftFixHint && (
                                             <div style={{
                                                 background:'#e3f2fd', color:'#0d47a1', padding:'8px 12px', marginBottom:'10px', 
                                                 borderRadius:'4px', borderLeft:'4px solid #1976d2', fontSize:'0.9em', display:'flex', alignItems:'center', justifyContent:'space-between'
                                             }}>
                                                 <span>{draftFixHint}</span>
                                                 <button onClick={() => setDraftFixHint(null)} style={{border:'none', background:'none', color:'#0d47a1', cursor:'pointer', fontWeight:'bold'}}>×</button>
                                             </div>
                                         )}
                                         
                                         <textarea 
                                             value={draftEditorText}
                                             onChange={(e) => {
                                                 setDraftEditorText(e.target.value);
                                                 setDraftEditorDirty(true);
                                                 setDraftEditorError(null);
                                             }}
                                             style={{
                                                 flex:1, width:'100%', fontFamily:'monospace', fontSize:'12px',
                                                 border: draftEditorError ? '1px solid red' : '1px solid #ccc',
                                                 padding:'8px', boxSizing:'border-box',
                                                 resize:'none',
                                                 minHeight: 0
                                             }}
                                             spellCheck={false}
                                         />
                                         
                                         {draftEditorError && (
                                             <div style={{color:'red', fontSize:'0.85em', marginTop:'5px', maxHeight:'40px', overflowY:'auto'}}>
                                                 {draftEditorError}
                                             </div>
                                         )}
                                         
                                         <div style={{marginTop:'10px', display:'flex', flexWrap:'wrap', gap:'10px', alignItems:'center'}}>
                                             <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
                                                 <button
                                                     onClick={() => {
                                                         try { 
                                                             JSON.parse(draftEditorText); 
                                                             setDraftEditorError(null); 
                                                             setDraftValidateOk(true);
                                                             setTimeout(() => setDraftValidateOk(false), 2000);
                                                         } 
                                                         catch(e:unknown) { 
                                                             setDraftEditorError("Invalid: " + (e instanceof Error ? e.message : String(e))); 
                                                         }
                                                     }}
                                                     style={{padding:'6px 12px', cursor:'pointer'}}
                                                 >
                                                     Validate
                                                 </button>
                                                 {draftValidateOk && <span style={{color:'green', fontSize:'0.9em', fontWeight:'bold'}}>✓ Valid JSON</span>}
                                                 
                                                 <button 
                                                     onClick={handleSaveDraftBlock}
                                                     disabled={!draftEditorDirty || !!draftEditorError}
                                                     style={{
                                                         padding:'6px 12px', cursor:'pointer', fontWeight:'bold',
                                                         background: (!draftEditorDirty || !!draftEditorError) ? '#ccc' : '#007acc',
                                                         color: 'white', border:'none', borderRadius:'3px'
                                                     }}
                                                 >
                                                     Save to Draft
                                                 </button>
                                             </div>

                                             <div style={{display:'flex', gap:'10px', marginLeft:'auto'}}>
                                                 <button 
                                                     onClick={handleRevertBlock}
                                                     style={{padding:'6px 12px', cursor:'pointer'}}
                                                     title="Revert modifications to original"
                                                 >
                                                     Revert Block
                                                 </button>
                                                 
                                                 <button 
                                                     onClick={handleDuplicateBlock}
                                                     disabled={!selectedBlock}
                                                     style={{
                                                         padding:'6px 12px', 
                                                         cursor: !selectedBlock ? 'not-allowed' : 'pointer'
                                                     }}
                                                     title="Duplicate this block"
                                                 >
                                                     Duplicate Block
                                                 </button>
                                                 
                                                 <button 
                                                     onClick={() => setShowDeletePreview(!showDeletePreview)}
                                                     disabled={!selectedBlock}
                                                     style={{
                                                         padding:'6px 12px', 
                                                         cursor: !selectedBlock ? 'not-allowed' : 'pointer',
                                                         background: !selectedBlock ? '#f5f5f5' : '#ffebee',
                                                         border: !selectedBlock ? '1px solid #ccc' : '1px solid #b71c1c',
                                                         color: !selectedBlock ? '#aaa' : '#b71c1c',
                                                         fontWeight: 600,
                                                         borderRadius:'4px'
                                                     }}
                                                     title="Delete this block from Draft"
                                                 >
                                                     Delete Block
                                                 </button>
                                             </div>
                                         </div>
                                         
                                         {showDeletePreview && selectedBlock && (
                                             <div style={{marginTop:'10px', padding:'10px', border:'1px solid #b71c1c', background:'#fff5f5', borderRadius:'4px'}}>
                                                 <div style={{fontWeight:'bold', color:'#b71c1c', marginBottom:'5px'}}>Execute Deletion?</div>
                                                 <div style={{marginBottom:'10px', fontSize:'0.9em', color:'#333'}}>
                                                     Remove block "<strong>{selectedBlock.blockId}</strong>" from draft?
                                                     <div style={{marginTop:'5px'}}>
                                                        Impact Analysis:
                                                        {deleteImpact.referencedByBindings.length > 0 ? (
                                                            <div style={{marginTop:'5px'}}>
                                                                <div style={{color:'#d32f2f', fontWeight:'bold'}}>Warning: Referenced by bindings!</div>
                                                                <ul style={{margin:'5px 0', paddingLeft:'20px', fontSize:'0.9em', color:'#555'}}>
                                                                    {deleteImpact.referencedByBindings.slice(0, 5).map((ref, idx) => (
                                                                        <li key={idx}>{ref.detail}</li>
                                                                    ))}
                                                                    {deleteImpact.referencedByBindings.length > 5 && <li>...and more</li>}
                                                                </ul>
                                                            </div>
                                                        ) : (
                                                            <div style={{color:'#2e7d32', fontStyle:'italic', marginTop:'5px'}}>No binding references found.</div>
                                                        )}
                                                     </div>
                                                 </div>
                                                 <div style={{display:'flex', gap:'10px', justifyContent:'flex-end'}}>
                                                     <button onClick={() => setShowDeletePreview(false)} style={{padding:'6px 12px', cursor:'pointer'}}>Cancel</button>
                                                     <button 
                                                        onClick={handleDeleteBlock} 
                                                        style={{
                                                            padding:'6px 12px', cursor:'pointer', 
                                                            background:'#b71c1c', color:'white', border:'none', borderRadius:'4px', fontWeight:'bold'
                                                        }}
                                                     >
                                                        Confirm Delete
                                                     </button>
                                                 </div>
                                             </div>
                                         )}

                                         {selectedBlock && draftDiff.modified.includes(selectedBlock.blockId) && bundleData && (
                                              <div style={{marginTop:'20px', border:'1px solid #ccc', borderRadius:'6px', overflow:'hidden'}}>
                                                  <div 
                                                     onClick={() => setShowDataDiff(!showDataDiff)}
                                                     style={{
                                                         background:'#f1f5f9', padding:'8px 12px', 
                                                         cursor:'pointer', fontWeight:'bold', fontSize:'0.9em',
                                                         display:'flex', justifyContent:'space-between', alignItems:'center',
                                                         color:'#333'
                                                     }}
                                                  >
                                                      <span>Data Diff (vs Active)</span>
                                                      <span>{showDataDiff ? 'Hide Diff' : 'Show Diff'}</span>
                                                  </div>
                                                  
                                                  {showDataDiff && (
                                                      <div style={{padding:'10px', background:'white', borderTop:'1px solid #ccc', maxHeight:'300px', overflowY:'auto'}}>
                                                          {(() => {
                                                              const activeBlock = (bundleData as any).blocks?.[selectedBlock.blockId];
                                                              if (!activeBlock) return <div style={{fontStyle:'italic', color:'#666'}}>Original block not found in active bundle.</div>;
                                                              
                                                              const diffs = diffData(activeBlock.data, selectedBlock.data);
                                                              if (diffs.length === 0) return <div style={{fontStyle:'italic', color:'#666'}}>No data differences detected.</div>;
                                                              
                                                              return (
                                                                  <div style={{display:'flex', flexDirection:'column', gap:'8px'}}>
                                                                      {diffs.map((d, i) => (
                                                                          <div key={i} style={{fontSize:'0.85em', fontFamily:'monospace', borderBottom:'1px solid #eee', paddingBottom:'6px'}}>
                                                                              <div style={{fontWeight:'bold', color:'#111', marginBottom:'2px'}}>{d.path}</div>
                                                                              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px'}}>
                                                                                  <div style={{background:'#fef2f2', padding:'4px', borderRadius:'3px', color:'#7f1d1d', overflowX:'auto'}}>
                                                                                      <div style={{fontSize:'0.8em', fontWeight:'bold', marginBottom:'2px', color:'#991b1b'}}>BEFORE</div>
                                                                                      <pre style={{margin:0, whiteSpace:'pre-wrap', wordBreak:'break-all'}}>{typeof d.before === 'undefined' ? '(undefined)' : JSON.stringify(d.before)}</pre>
                                                                                  </div>
                                                                                  <div style={{background:'#ecfdf5', padding:'4px', borderRadius:'3px', color:'#065f46', overflowX:'auto'}}>
                                                                                      <div style={{fontSize:'0.8em', fontWeight:'bold', marginBottom:'2px', color:'#064e3b'}}>AFTER</div>
                                                                                      <pre style={{margin:0, whiteSpace:'pre-wrap', wordBreak:'break-all'}}>{typeof d.after === 'undefined' ? '(undefined)' : JSON.stringify(d.after)}</pre>
                                                                                  </div>
                                                                              </div>
                                                                          </div>
                                                                      ))}
                                                                      {diffs.length >= 50 && <div style={{color:'#666', fontStyle:'italic', fontSize:'0.9em'}}>...more changes truncated...</div>}
                                                                  </div>
                                                              );
                                                          })()}
                                                      </div>
                                                  )}
                                              </div>
                                         )}
                                     </>
                                 ) : (
                                     <div style={{padding:'20px', color:'#888', fontStyle:'italic'}}>Select a block to edit its data.</div>
                                 )}
                             </div>
                         </div>
                         
                         {/* Footer: Full Draft JSON */}
                         <div style={{marginTop:'10px', paddingTop:'10px', borderTop:'1px solid #ccc'}}>
                             <button 
                                 onClick={() => setDraftShowFullJson(!draftShowFullJson)}
                                 style={{background:'none', border:'none', color:'#007acc', cursor:'pointer', padding:0, textDecoration:'underline'}}
                             >
                                 {draftShowFullJson ? 'Hide Full Draft JSON' : 'View Full Draft JSON'}
                             </button>
                             {draftShowFullJson && (
                                 <div style={{marginTop:'5px', position:'relative'}}>
                                     <div style={{position:'absolute', top:0, right:0}}>
                                         <CopyBtn k="draftbundle" text={draftBundle} />
                                     </div>
                                     <pre style={preStyle}>{JSON.stringify(draftBundle, null, 2)}</pre>
                                 </div>
                             )}
                             <div style={{marginTop:'5px', fontSize:'0.8em', color:'#666', fontStyle:'italic'}}>
                                 Draft is local-only. Apply is not implemented in this phase.
                             </div>
                         </div>
                     </div>
                 );
            }
            case 'Invocations': {
                 const invs = invocations || [];
                 
                 // If major error blocking access
                 if (invocationsError) {
                     return (
                         <div style={{padding:'20px'}}>
                             <div style={{color:'red', fontWeight:'bold', marginBottom:'10px'}}>{invocationsError}</div>
                             {/* Keep the tab usable/visible, but show disabled message */}
                             <div style={{color:'#666', fontStyle:'italic'}}>
                                 Invocations data is currently unavailable.
                             </div>
                         </div>
                     );
                 }

                 return (
                     <div style={{display:'flex', flexDirection:'column', height:'100%'}}>
                         {/* List Header */}
                         <div style={{padding:'10px', display:'flex', flexDirection:'column', gap:'5px', background:'#f5f5f5', borderBottom:'1px solid #ddd'}}>
                            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                <strong>Recent Invocations ({invs.length})</strong>
                                <button onClick={refreshInvocations} style={{cursor:'pointer', padding:'4px 8px'}}>Refresh</button>
                            </div>
                            <div style={{fontSize:'0.8em', color:'#666', fontStyle:'italic'}}>
                                Records are appended when actions are dispatched.
                            </div>
                         </div>

                         {/* List Content */}
                         <div style={{flex:1, overflowY:'auto'}}>
                             {invs.length === 0 ? (
                                 <div style={{padding:'20px', color:'#777', fontStyle:'italic'}}>No invocations recorded yet.</div>
                             ) : (
                                 <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.9em'}}>
                                     <thead style={{background:'#eee', position:'sticky', top:0}}>
                                         <tr>
                                             <th style={{padding:'6px', textAlign:'left', borderBottom:'1px solid #ccc'}}>Time</th>
                                             <th style={{padding:'6px', textAlign:'left', borderBottom:'1px solid #ccc'}}>Action</th>
                                             <th style={{padding:'6px', textAlign:'left', borderBottom:'1px solid #ccc'}}>Source</th>
                                             <th style={{padding:'6px', textAlign:'left', borderBottom:'1px solid #ccc'}}>Status</th>
                                             <th style={{padding:'6px', textAlign:'left', borderBottom:'1px solid #ccc'}}>Details</th>
                                         </tr>
                                     </thead>
                                     <tbody>
                                         {invs.slice().reverse().map((inv: any) => {
                                             const rowKey = `${inv.ts}-${inv.actionId}-${inv.sourceBlockId || 'unknown'}`;
                                             const isExpanded = expandedInvocationKey === rowKey;

                                             return (
                                                 <Fragment key={rowKey}>
                                                     <tr
                                                         onClick={() => setExpandedInvocationKey(isExpanded ? null : rowKey)}
                                                         style={{
                                                             borderBottom: isExpanded ? 'none' : '1px solid #eee',
                                                             cursor: 'pointer',
                                                             background: isExpanded ? '#f8f9fa' : 'white'
                                                         }}
                                                     >
                                                         <td style={{padding:'6px', color:'#555'}}>{inv.ts ? new Date(inv.ts).toLocaleTimeString() : '-'}</td>
                                                         <td style={{padding:'6px'}}>{inv.actionId || '-'}</td>
                                                         <td style={{padding:'6px', color:'#555'}}>{inv.sourceBlockId || '-'}</td>
                                                         <td style={{padding:'6px'}}>
                                                             <span style={{
                                                                 background: inv.status === 'received' ? '#e8f5e9' : '#e0f7fa',
                                                                 color: inv.status === 'received' ? '#2e7d32' : '#006064',
                                                                 padding:'2px 6px', borderRadius:'4px', fontSize:'0.85em', fontWeight:'bold'
                                                             }}>
                                                                 {inv.status || '-'}
                                                             </span>
                                                         </td>
                                                         <td style={{padding:'6px', color:'#555'}}>{inv.details ? 'view' : '-'}</td>
                                                     </tr>
                                                     {isExpanded && (
                                                         <tr style={{borderBottom:'1px solid #ddd', background:'#f8f9fa'}}>
                                                             <td colSpan={5} style={{padding:'0 15px 15px 15px'}}>
                                                                 <div style={{
                                                                     padding:'10px',
                                                                     border:'1px solid #ddd',
                                                                     borderRadius:'4px',
                                                                     background:'white',
                                                                     display:'flex',
                                                                     flexDirection:'column',
                                                                     gap:'8px'
                                                                 }}>
                                                                     <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                                                                         <div style={{fontWeight:'bold', color:'#333'}}>Invocation Details</div>
                                                                         <CopyBtn k={`inv-${rowKey}`} text={inv} />
                                                                     </div>
                                                                     <pre style={{margin:0, background:'#f5f5f5', padding:'6px', borderRadius:'4px', fontSize:'0.85em'}}>
                                                                         {JSON.stringify(inv, null, 2)}
                                                                     </pre>
                                                                 </div>
                                                             </td>
                                                         </tr>
                                                     )}
                                                 </Fragment>
                                             );
                                         })}
                                     </tbody>
                                 </table>
                             )}
                         </div>
                     </div>
                 );
            }
            case 'Activations': {
                 const items = activationEvents || [];

                 return (
                     <div style={{display:'flex', flexDirection:'column', height:'100%'}}>
                         <div style={{padding:'10px', borderBottom:'1px solid #ddd', display:'flex', alignItems:'center', justifyContent:'space-between', background:'#fafafa'}}>
                             <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                 <strong style={{fontSize:'1.1em'}}>Activations</strong>
                                <button onClick={() => refreshActivations()} style={{cursor:'pointer', padding:'2px 8px', fontSize:'0.9em'}}>Refresh</button>
                                 {activationEventsLoading && <span style={{fontSize:'0.85em', color:'#666'}}>Loading...</span>}
                             </div>
                             <div style={{display:'flex', gap:'6px', alignItems:'center'}}>
                                 {(['all', 'success', 'failure'] as ActivationFilter[]).map(filter => (
                                     <button
                                         key={filter}
                                         onClick={() => { setActivationFilter(filter); refreshActivations(filter); }}
                                         style={{
                                             cursor:'pointer',
                                             padding:'2px 8px',
                                             fontSize:'0.85em',
                                             borderRadius:'4px',
                                             border: activationFilter === filter ? '1px solid #007acc' : '1px solid #ccc',
                                             background: activationFilter === filter ? '#e3f2fd' : '#fff',
                                             color: activationFilter === filter ? '#0d47a1' : '#333'
                                         }}
                                     >
                                         {filter === 'all' ? 'All' : (filter === 'success' ? 'Success' : 'Failure')}
                                     </button>
                                 ))}
                             </div>
                         </div>

                         {activationEventsError ? (
                             <div style={{padding:'20px', color:'#c62828'}}>{activationEventsError}</div>
                         ) : !activationEvents ? (
                             <div style={{padding:'20px', color:'#666'}}>Loading activation events...</div>
                         ) : items.length === 0 ? (
                             <div style={{padding:'20px', color:'#666', fontStyle:'italic'}}>No activation events yet.</div>
                         ) : (
                             <div style={{flex:1, overflowY:'auto'}}>
                                 <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.9em'}}>
                                     <thead style={{background:'#eee', position:'sticky', top:0}}>
                                         <tr>
                                             <th style={{padding:'6px', textAlign:'left', borderBottom:'1px solid #ccc'}}>Time</th>
                                             <th style={{padding:'6px', textAlign:'left', borderBottom:'1px solid #ccc'}}>Outcome</th>
                                             <th style={{padding:'6px', textAlign:'left', borderBottom:'1px solid #ccc'}}>Version</th>
                                             <th style={{padding:'6px', textAlign:'left', borderBottom:'1px solid #ccc'}}>Actor</th>
                                             <th style={{padding:'6px', textAlign:'left', borderBottom:'1px solid #ccc'}}>Reason</th>
                                             <th style={{padding:'6px', textAlign:'left', borderBottom:'1px solid #ccc'}}>Error</th>
                                         </tr>
                                     </thead>
                                     <tbody>
                                         {items.map((evt, idx) => {
                                             const outcomeColor = evt.outcome === 'success' ? '#2e7d32' : '#c62828';
                                             const reasonText = evt.reason || (evt.outcome === 'failure' ? evt.errorMessage || '' : '');
                                             const errorText = evt.outcome === 'failure' ? (evt.errorMessage || '') : '';
                                             return (
                                                 <tr key={evt.id || `${evt.ts}-${idx}`} style={{borderBottom:'1px solid #eee'}}>
                                                     <td style={{padding:'6px', color:'#555'}}>{evt.ts ? new Date(evt.ts).toLocaleString() : '-'}</td>
                                                     <td style={{padding:'6px'}}>
                                                         <span style={{color: outcomeColor, fontWeight: 600}}>{evt.outcome}</span>
                                                     </td>
                                                     <td style={{padding:'6px', fontFamily:'monospace'}}>{evt.targetVersion || '-'}</td>
                                                     <td style={{padding:'6px', color:'#555'}}>{evt.actor || '-'}</td>
                                                     <td style={{padding:'6px', color:'#555'}}>
                                                         <span
                                                             title={reasonText}
                                                             style={{display:'inline-block', maxWidth:'360px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', verticalAlign:'bottom'}}
                                                         >
                                                             {reasonText || '-'}
                                                         </span>
                                                     </td>
                                                     <td style={{padding:'6px', color:'#555'}}>
                                                         <span
                                                             title={errorText}
                                                             style={{display:'inline-block', maxWidth:'220px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', verticalAlign:'bottom'}}
                                                         >
                                                             {errorText || '-'}
                                                         </span>
                                                     </td>
                                                 </tr>
                                             );
                                         })}
                                     </tbody>
                                 </table>
                             </div>
                         )}
                     </div>
                 );
            }
            case 'Snapshot': {
                 return renderSnapshotContent();
            }
            case 'UI Runtime': {
                const openWindows = runtimePlan ? Object.values(runtimePlan.windows || {}) : [];
                const focusedId = runtimePlan?.focusedWindowId ?? null;

                return (
                    <div style={{display:'flex', flexDirection:'column', height:'100%'}}>
                        <div style={{padding:'10px', borderBottom:'1px solid #ddd', display:'flex', alignItems:'center', justifyContent:'space-between', background:'#fafafa'}}>
                            <strong style={{fontSize:'1.1em'}}>Frontend UI Runtime</strong>
                            <div style={{display:'flex', gap:'8px'}}>
                                <button onClick={onCloseAllWindows} style={{cursor:'pointer', padding:'2px 8px', fontSize:'0.9em'}}>Close All Windows</button>
                                <button onClick={onResetWindowLayout} style={{cursor:'pointer', padding:'2px 8px', fontSize:'0.9em'}}>Reset Window Layout</button>
                                <button onClick={onClearWindowEvents} style={{cursor:'pointer', padding:'2px 8px', fontSize:'0.9em'}}>Clear Events</button>
                            </div>
                        </div>

                        <div style={{display:'flex', flexDirection:'column', gap:'15px', padding:'10px', overflowY:'auto'}}>
                            <div style={{border:'1px solid #ddd', borderRadius:'4px', background:'#fff'}}>
                                <div style={{padding:'8px 10px', borderBottom:'1px solid #eee', fontWeight:'bold'}}>Open Windows ({openWindows.length})</div>
                                {openWindows.length === 0 ? (
                                    <div style={{padding:'10px', color:'#777', fontStyle:'italic'}}>No windows are currently open.</div>
                                ) : (
                                    <ul style={{margin:0, padding:'10px 20px'}}>
                                        {openWindows.map(w => (
                                            <li key={w.id} style={{marginBottom:'6px'}}>
                                                {w.id}
                                                {focusedId === w.id && <span style={{marginLeft:'6px', color:'#007acc'}}>(focused)</span>}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            <div style={{border:'1px solid #ddd', borderRadius:'4px', background:'#fff'}}>
                                <div style={{padding:'8px 10px', borderBottom:'1px solid #eee', fontWeight:'bold'}}>Recent Window Events ({windowEvents.length})</div>
                                {windowEvents.length === 0 ? (
                                    <div style={{padding:'10px', color:'#777', fontStyle:'italic'}}>No window events recorded yet.</div>
                                ) : (
                                    <ul style={{margin:0, padding:'10px 20px'}}>
                                        {windowEvents.map((evt, idx) => (
                                            <li key={`${evt.ts}-${evt.windowId}-${idx}`} style={{marginBottom:'6px'}}>
                                                <span style={{fontFamily:'monospace', color:'#555'}}>{new Date(evt.ts).toLocaleTimeString()}</span>
                                                <span style={{marginLeft:'8px', fontWeight:'bold'}}>{evt.kind}</span>
                                                <span style={{marginLeft:'8px'}}>{evt.windowId}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    </div>
                );
            }
            case 'Traces': {
                 return (
                     <div style={{display:'flex', flexDirection:'column', height:'100%'}}>
                         <div style={{padding:'10px', borderBottom:'1px solid #ddd', display:'flex', alignItems:'center', justifyContent:'space-between', background:'#fafafa'}}>
                             <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                 <strong style={{fontSize:'1.1em'}}>Dispatch Traces</strong>
                                 <button onClick={refreshTraces} style={{cursor:'pointer', padding:'2px 8px', fontSize:'0.9em'}}>Refresh</button>
                                 <span style={{fontSize:'0.85em', color:'#666', fontStyle:'italic'}}>Shows last 20 dispatches</span>
                             </div>
                         </div>
                         
                         {dispatchTracesError ? (
                             <div style={{padding:'20px', color:'red'}}>Error: {dispatchTracesError}</div>
                         ) : !dispatchTraces ? (
                             <div style={{padding:'20px', color:'#666'}}>Loading traces...</div>
                         ) : dispatchTraces.length === 0 ? (
                             <div style={{padding:'20px', color:'#666', fontStyle:'italic'}}>No traces recorded yet.</div>
                         ) : (
                             <div style={{flex:1, overflowY:'auto'}}>
                                 {dispatchTraces.map((trace, idx) => {
                                      const ts = (trace as any).ts ?? (trace as any).timestamp;
                                      const key = `${ts ?? 'trace'}-${idx}`;
                                      const isExpanded = expandedTraceKey === key;
                                      const status = (trace as any).status ?? '-';
                                      const statusColor = status === 'error' ? '#c62828' : (status === 'dispatched' || status === 'ok' ? '#2e7d32' : '#666');
                                      const actionId = (trace as any).actionId ?? '-';
                                      const durationMs = (trace as any).durationMs ?? '-';
                                      const reasonCode = (trace as any).reasonCode ?? '-';

                                      return (
                                          <div key={key} style={{borderBottom:'1px solid #eee'}}>
                                              <div 
                                                 onClick={() => setExpandedTraceKey(isExpanded ? null : key)}
                                                 style={{
                                                     padding:'8px 10px', 
                                                     cursor:'pointer', 
                                                     background: isExpanded ? '#f0f4c3' : 'white',
                                                     display:'flex', justifyContent:'space-between', alignItems:'center'
                                                 }}
                                                 onMouseEnter={e => { if(!isExpanded) e.currentTarget.style.background = '#f9f9f9'; }}
                                                 onMouseLeave={e => { if(!isExpanded) e.currentTarget.style.background = 'white'; }}
                                              >
                                                  <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
                                                      <span style={{fontFamily:'monospace', fontSize:'0.85em', color:'#555'}}>
                                                          {ts ? new Date(ts).toLocaleTimeString() : '-'}
                                                      </span>
                                                      <span style={{fontWeight:'bold', width:'220px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                                                          {actionId}
                                                      </span>
                                                      <span style={{
                                                          fontSize:'0.8em', fontWeight:'bold', color:'white', 
                                                          padding:'1px 6px', borderRadius:'3px', background: statusColor
                                                      }}>
                                                          {status}
                                                      </span>
                                                  </div>
                                                  <div style={{fontSize:'1.2em', color:'#aaa'}}>{isExpanded ? '−' : '+'}</div>
                                              </div>
                                              
                                              {isExpanded && (
                                                  <div style={{padding:'10px', background:'#fbfbfb', borderTop:'1px solid #eee'}}>
                                                      <div style={{display:'flex', justifyContent:'flex-end', marginBottom:'5px'}}>
                                                          <CopyBtn k={`tr-${key}`} text={trace} />
                                                      </div>
                                                      <div style={{fontSize:'0.9em', display:'grid', gridTemplateColumns:'auto 1fr', gap:'5px 15px', marginBottom:'10px'}}>
                                                          <div style={{color:'#666'}}>Timestamp:</div>
                                                          <div>{ts ?? '-'}</div>

                                                          <div style={{color:'#666'}}>Action:</div>
                                                          <div>{actionId}</div>

                                                          <div style={{color:'#666'}}>Status:</div>
                                                          <div>{status}</div>

                                                          <div style={{color:'#666'}}>Duration:</div>
                                                          <div>{durationMs}</div>

                                                          <div style={{color:'#666'}}>Reason:</div>
                                                          <div>{reasonCode}</div>
                                                      </div>

                                                      <pre style={{margin:0, background:'#f5f5f5', padding:'6px', borderRadius:'4px', fontSize:'0.85em'}}>
                                                          {JSON.stringify(trace, null, 2)}
                                                      </pre>
                                                  </div>
                                              )}
                                          </div>
                                      );
                                 })}
                             </div>
                         )}
                     </div>
                 );
            }

            case 'Resolved Graph': {
                return (
                    <div style={{display:'flex', flexDirection:'column', height:'100%'}}>
                         <div style={{padding:'10px', borderBottom:'1px solid #ddd', display:'flex', alignItems:'center', justifyContent:'space-between', background:'#fafafa'}}>
                             <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                 <strong style={{fontSize:'1.1em'}}>Resolved Graph Inspector</strong>
                                 <button onClick={refreshResolvedGraph} style={{cursor:'pointer', padding:'2px 8px', fontSize:'0.9em'}}>Refresh</button>
                             </div>
                         </div>
                         
                         {resolvedGraphLoading && <div style={{padding:'20px', color:'#666'}}>Loading...</div>}
                         {resolvedGraphError && <div style={{padding:'20px', color:'red'}}>Error: {resolvedGraphError}</div>}
                         
                         {!resolvedGraphLoading && !resolvedGraphError && resolvedGraph && (
                             <div style={{flex:1, overflowY:'auto', padding:'10px'}}>
                                 
                                 {/* Overview Stats */}
                                 <div style={{marginBottom:'20px', padding:'10px', background:'#f5f5f5', border:'1px solid #ddd', borderRadius:'4px'}}>
                                     <div style={{fontWeight:'bold', marginBottom:'5px'}}>Overview</div>
                                     <div style={{fontSize:'0.9em', display:'grid', gridTemplateColumns:'auto 1fr', gap:'5px 20px'}}>
                                         <div style={{color:'#666'}}>Node Count:</div><div>{resolvedGraph.diagnostics?.nodeCount ?? '-'}</div>
                                         <div style={{color:'#666'}}>Edge Count:</div><div>{resolvedGraph.diagnostics?.edgeCount ?? '-'}</div>
                                         <div style={{color:'#666'}}>Root Nodes:</div><div>{resolvedGraph.rootNodeIds?.join(', ') || 'None'}</div>
                                     </div>
                                 </div>

                                 {/* Data Sections */}
                                 <div style={{display:'flex', flexDirection:'column', gap:'20px'}}>
                                     
                                     {/* Nodes Summary */}
                                     <div>
                                         <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'5px'}}>
                                            <strong style={{fontSize:'1em'}}>Nodes ({Object.keys(resolvedGraph.nodesById || {}).length})</strong>
                                            <CopyBtn k="rg-nodes" text={resolvedGraph.nodesById} label="Copy Nodes JSON" />
                                         </div>
                                         <div style={{maxHeight:'300px', overflow:'auto', border:'1px solid #eee'}}>
                                             <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.85em'}}>
                                                 <thead style={{background:'#eee', position:'sticky', top:0}}>
                                                     <tr>
                                                         <th style={{textAlign:'left', padding:'4px'}}>ID</th>
                                                         <th style={{textAlign:'left', padding:'4px'}}>Type</th>
                                                         <th style={{textAlign:'left', padding:'4px'}}>Children</th>
                                                     </tr>
                                                 </thead>
                                                 <tbody>
                                                     {Object.keys(resolvedGraph.nodesById || {}).map(nid => {
                                                         const n = resolvedGraph.nodesById[nid];
                                                         return (
                                                             <tr key={nid} style={{borderBottom:'1px solid #f0f0f0'}}>
                                                                 <td style={{padding:'4px', fontWeight:'bold'}}>{nid}</td>
                                                                 <td style={{padding:'4px'}}>{n.type}</td>
                                                                 <td style={{padding:'4px', color:'#666'}}>{n.children?.length || 0}</td>
                                                             </tr>
                                                         );
                                                     })}
                                                 </tbody>
                                             </table>
                                         </div>
                                     </div>

                                     {/* Slots Summary */}
                                     <div>
                                         <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'5px'}}>
                                            <strong style={{fontSize:'1em'}}>Slots ({Object.keys(resolvedGraph.slotsById || {}).length})</strong>
                                            <CopyBtn k="rg-slots" text={resolvedGraph.slotsById} label="Copy Slots JSON" />
                                         </div>
                                         <div style={{padding:'10px', background:'#fafafa', border:'1px solid #eee', fontSize:'0.9em', fontFamily:'monospace'}}>
                                             {Object.keys(resolvedGraph.slotsById || {}).join(', ')}
                                         </div>
                                     </div>

                                     {/* Full JSON Dump (Collapsed) */}
                                     <details>
                                         <summary style={{cursor:'pointer', color:'#007acc', fontWeight:'bold'}}>Show Full Resolved Graph JSON</summary>
                                         <pre style={{marginTop:'10px', background:'#f5f5f5', padding:'10px', border:'1px solid #ddd', borderRadius:'4px', overflow:'auto', maxHeight:'400px'}}>
                                             {JSON.stringify(resolvedGraph, null, 2)}
                                         </pre>
                                     </details>
                                 </div>
                             </div>
                         )}
                    </div>
                );
            }

            default: return null;
        }
    };

    return (
        <div className={safeModeEnabled ? "sysadmin-panel safe-mode" : "sysadmin-panel"} style={{
            position: safeModeEnabled ? 'fixed' : 'absolute',
            top: safeModeEnabled ? '8px' : '2.5%',
            left: safeModeEnabled ? '8px' : '2.5%',
            right: safeModeEnabled ? '8px' : undefined,
            bottom: safeModeEnabled ? '8px' : undefined,
            width: safeModeEnabled ? 'auto' : '95%',
            height: safeModeEnabled ? 'auto' : '95%',
            backgroundColor: 'white', color: '#222', 
            border: '2px solid #333', boxShadow: '0 5px 20px rgba(0,0,0,0.3)',
            zIndex: 9000, display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}>
            <ConfirmModal 
                isOpen={confirmModal.isOpen} 
                title={confirmModal.title} 
                message={confirmModal.message} 
                onConfirm={confirmModal.onConfirm} 
                onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} 
            />
            {showActivateDraftModal && (
                <div style={{
                    position:'fixed',
                    top:0, left:0, right:0, bottom:0,
                    background:'rgba(0,0,0,0.35)',
                    zIndex: 9100,
                    display:'flex',
                    alignItems:'center',
                    justifyContent:'center'
                }}>
                    <div style={{
                        background:'#fff',
                        border:'1px solid #ccc',
                        borderRadius:'6px',
                        width:'520px',
                        maxWidth:'92%',
                        padding:'16px',
                        boxShadow:'0 6px 16px rgba(0,0,0,0.2)'
                    }}>
                        <div style={{fontWeight:'bold', marginBottom:'8px'}}>Activate Draft</div>
                        <div style={{fontSize:'0.9em', color:'#555', marginBottom:'10px'}}>
                            Provide a reason for activation. This will reload the active configuration.
                        </div>
                        <textarea
                            value={activateDraftReason}
                            onChange={e => setActivateDraftReason(e.target.value)}
                            rows={4}
                            style={{width:'100%', resize:'vertical', padding:'8px', border:'1px solid #ccc', borderRadius:'4px', fontFamily:'inherit'}}
                            placeholder="Reason for activation..."
                        />
                        <div style={{display:'flex', justifyContent:'flex-end', gap:'8px', marginTop:'12px'}}>
                            <button
                                onClick={() => { setShowActivateDraftModal(false); setActivateDraftReason(''); }}
                                style={{padding:'6px 12px', background:'#fff', color:'#111', border:'1px solid #ccc', borderRadius:'4px', cursor:'pointer'}}
                                disabled={activateDraftSaving}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleActivateDataStaticVersion}
                                style={{padding:'6px 12px', background:'#e65100', color:'#fff', border:'1px solid #e65100', borderRadius:'4px', cursor:'pointer', fontWeight:'bold'}}
                                disabled={activateDraftSaving}
                            >
                                {activateDraftSaving ? 'Activating…' : 'Activate'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {isApplying && (
                <div style={{
                    position:'absolute',
                    top:0, left:0, right:0, bottom:0,
                    background:'rgba(255,255,255,0.7)',
                    zIndex: 9050,
                    display:'flex',
                    alignItems:'center',
                    justifyContent:'center'
                }}>
                    <div style={{
                        background:'#fff',
                        border:'1px solid #ccc',
                        borderRadius:'6px',
                        padding:'12px 16px',
                        boxShadow:'0 4px 10px rgba(0,0,0,0.15)',
                        fontWeight:'bold'
                    }}>
                        Applying configuration…
                    </div>
                </div>
            )}
            {toast && (
                <ToastNotification 
                    message={toast.message} 
                    type={toast.type} 
                    onClose={() => setToast(null)} 
                />
            )}
            <div style={{background: '#333', color:'white', padding:'8px 12px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                    <h3 style={{margin:0, fontSize:'1em'}}>Sysadmin</h3>
                    <span style={{
                        fontSize:'0.75em', fontWeight:'bold', 
                        padding:'1px 6px', borderRadius:'10px',
                        background: runningSource === 'ACTIVE' ? '#2e7d32' : '#f57c00',
                        color: 'white', border: '1px solid rgba(255,255,255,0.3)'
                    }}>
                        Running: {runningSource}
                    </span>
                    <button
                        onClick={() => { if (lastDraftVersionId) setShowActivateDraftModal(true); }}
                        disabled={!lastDraftVersionId || activateDraftSaving}
                        style={{
                            cursor: (!lastDraftVersionId || activateDraftSaving) ? 'default' : 'pointer',
                            padding:'2px 8px',
                            fontSize:'0.8em',
                            background: primaryColor,
                            color: 'white',
                            border: `1px solid ${primaryColor}`,
                            opacity: lastDraftVersionId ? 1 : 0.6,
                            borderRadius:'4px'
                        }}
                        title={lastDraftVersionId ? 'Activate saved draft version' : 'Save a draft first'}
                    >
                        {activateDraftSaving ? 'Activating…' : 'Activate Draft'}
                    </button>
                </div>
                <button onClick={onClose} style={{background:'transparent', color:'white', border:'none', fontSize:'1.2em', cursor:'pointer'}}>×</button>
            </div>

            {sessionBanner && !(showActivateDraftModal && sessionBanner.message?.includes('Activation reason is required')) && (
                <div style={{
                    background: sessionBanner.kind === 'success' ? '#e8f5e9' : '#ffebee',
                    color: sessionBanner.kind === 'success' ? '#1b5e20' : '#b71c1c',
                    borderBottom: `1px solid ${sessionBanner.kind === 'success' ? '#c8e6c9' : '#ffcdd2'}`,
                    padding:'8px 12px',
                    display:'flex',
                    alignItems:'center',
                    justifyContent:'space-between',
                    fontSize:'0.9em',
                    fontWeight: 600
                }}>
                    <span>{sessionBanner.message}</span>
                    <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                        {sessionBanner.action === 'reload' && (
                            <button
                                onClick={() => {
                                    try {
                                        sessionStorage.removeItem(SESSION_BANNER_KEY);
                                    } catch {
                                        // ignore
                                    }
                                    setSessionBanner(null);
                                    window.location.reload();
                                }}
                                style={{
                                    background: 'white',
                                    border: `1px solid ${sessionBanner.kind === 'success' ? '#c8e6c9' : '#ffcdd2'}`,
                                    color: 'inherit',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    padding: '2px 8px',
                                    fontSize: '0.85em',
                                    fontWeight: 600
                                }}
                            >
                                Reload now
                            </button>
                        )}
                        <button
                            onClick={dismissBanner}
                            style={{
                                background:'none',
                                border:'none',
                                cursor:'pointer',
                                color:'inherit',
                                fontSize:'1.1em',
                                lineHeight:1,
                                opacity:0.7
                            }}
                            title="Dismiss"
                        >
                            ×
                        </button>
                    </div>
                </div>
            )}
            
            <div style={{
                display:'flex', 
                flexWrap: 'wrap',
                alignItems: 'flex-end',
                minHeight: '44px',
                background: '#e5e5e5', 
                color: '#111', 
                borderBottom:'1px solid #ccc', 
                paddingTop:'5px', 
                paddingLeft:'5px'
            }}>
                {tabs.map(t => {
                    const isActive = activeTab === t;
                    return (
                        <button 
                            key={t} 
                            onClick={() => { 
                                setActiveTab(t); 
                                setFilter(''); 
                                setSelectedBlockId(null); 
                                setSelectedBindingId(null); 
                                setSelectedActionId(null);
                                setConfirmActivate(false);
                                setNodeEditorSelectedId(null);
                                setNodeEditorForm({});
                                setNodeEditorDirty(false);

                                if (t === 'Snapshot') {
                                    refreshSnapshot();
                                    fetchAdapterCaps();
                                }
                                if (t === 'Traces') refreshTraces();
                                if (t === 'Invocations') refreshInvocations();
                            }}
                            style={{
                                flex: '0 0 auto',
                                padding:'8px 10px', 
                                border: isActive ? '1px solid #ccc' : '1px solid transparent',
                                borderBottom: isActive ? '1px solid #fff' : '1px solid transparent',
                                background: isActive ? '#fff' : 'transparent',
                                color: isActive ? '#111' : '#333',
                                fontWeight: isActive ? 700 : 600, 
                                cursor:'pointer',
                                borderTopLeftRadius: 8,
                                borderTopRightRadius: 8,
                                marginBottom: '-1px' // Overlap border
                            }}
                        >
                            {t}
                        </button>
                    );
                })}
            </div>

            <div style={{flex:1, overflowY:'auto', padding:'10px', minHeight: 0}}>
                {renderContent()}
            </div>
        </div>
    );
}

function App() {
  
  const [caps, setCaps] = useState<RuntimeCapabilities>({ debugEndpointsEnabled: false, devModeOverridesEnabled: false });
  const hasDevAuth = !!localStorage.getItem('FOLE_DEV_AUTH');
  const canUseDebugUi = caps.debugEndpointsEnabled && hasDevAuth;
  const uiBuildIdRef = useRef(UI_BUILD_ID);
  const buildCheckInFlightRef = useRef(false);

  const triggerBuildCheck = async () => {
      if (buildCheckInFlightRef.current) return;
      buildCheckInFlightRef.current = true;
      try {
          const BUILD_ID_STORAGE_KEY = 'fole.dev.serverBuildId';
          const UI_BUILD_ID_STORAGE_KEY = 'fole.dev.uiBuildId';
          const SESSION_BANNER_KEY = 'fole.sysadmin.sessionBanner';

          const devAuth = localStorage.getItem('FOLE_DEV_AUTH');
          const headers = new Headers();
          if (devAuth) headers.set('X-Dev-Auth', devAuth);

          const res = await fetch(apiUrl('/api/v1/meta/build'), { headers });
          if (!res.ok) return;
          const json = await res.json().catch(() => null);
          const serverBuildId = json?.data?.serverBuildId;
          if (!serverBuildId || typeof serverBuildId !== 'string') return;

          const lastSeen = sessionStorage.getItem(BUILD_ID_STORAGE_KEY);
          if (lastSeen && lastSeen !== serverBuildId) {
              const banner = {
                  kind: 'error',
                  message: 'New UI/server version detected — reload recommended',
                  ts: Date.now(),
                  action: 'reload'
              };
              sessionStorage.setItem(SESSION_BANNER_KEY, JSON.stringify(banner));
              window.dispatchEvent(new Event('fole:session-banner'));
          }

          sessionStorage.setItem(BUILD_ID_STORAGE_KEY, serverBuildId);
          sessionStorage.setItem(UI_BUILD_ID_STORAGE_KEY, uiBuildIdRef.current);
      } catch {
          // ignore
      } finally {
          buildCheckInFlightRef.current = false;
      }
  };

  useEffect(() => {
      void triggerBuildCheck();
  }, []);


  useEffect(() => {
     fetch(apiUrl('/api/runtime/capabilities'))
        .then(res => res.ok ? res.json() : null)
        .then(d => d && setCaps(d))
        .catch(() => {}); 
  }, []);

  const debugFetch = async (inputPath: string, init?: RequestInit): Promise<Response | null> => {
      if (!caps.debugEndpointsEnabled) return null;

      // temporary dev bridge; final system uses real auth permissions.
      const devAuth = localStorage.getItem('FOLE_DEV_AUTH');
      if (!devAuth) return null;

      try {
          const headers = new Headers(init?.headers || {});
          headers.set('X-Dev-Auth', devAuth);

          return await fetch(apiUrl(inputPath), {
              ...init,
              headers
          });
      } catch (e) {
          console.warn("Debug fetch blocked/failed", e);
          return null;
      }
  };

  const [showV2, setShowV2] = useState(false);
  // v2RefreshKey removed to clean up unused state

  // Check query param for v2 preview on mount
  useEffect(() => {
     const params = new URLSearchParams(window.location.search);
     if (params.get('v2Preview')) {
         setShowV2(true);
     }
  }, []);
  
  const [bundleData, setBundleData] = useState<BundleResponse | null>(null);
  const [pingData, setPingData] = useState<PingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Runtime
  const runtimeRef = useRef<WindowSystemRuntime>(new WindowSystemRuntime());
  const [runtimePlan, setRuntimePlan] = useState<RuntimePlan | null>(null);

  // Sysadmin Toggle
  const [sysadminOpen, setSysadminOpen] = useState(false);

  useEffect(() => {
      if (sysadminOpen) {
          void triggerBuildCheck();
      }
  }, [sysadminOpen]);
  
  // Safe Mode Override (Recovery)
  const [safeModeEnabled, setSafeModeEnabled] = useState(() => localStorage.getItem('FOLE_SAFE_MODE') === '1');

  useEffect(() => {
    localStorage.setItem('FOLE_SAFE_MODE', safeModeEnabled ? '1' : '0');
  }, [safeModeEnabled]);
  
  // Runtime Source State (Prep for Apply phase)
  const [runningSource, setRunningSource] = useState<'ACTIVE' | 'DRAFT'>('ACTIVE');
  const [lastActiveBundle, setLastActiveBundle] = useState<BundleResponse | null>(null);
  const [lastConfigEvent, setLastConfigEvent] = useState<null | { kind: 'APPLY' | 'ROLLBACK'; ts: number }>(null);

  // Viewport Ref for clamping
  const viewportRef = useRef<HTMLDivElement>(null);

  // Debug Action State
  const [sourceBlockId, setSourceBlockId] = useState('');
  const [actionName, setActionName] = useState('');
  const [actionPerms, setActionPerms] = useState('can_click');
  const [actionResult, setActionResult] = useState<unknown>(null);
  
  // Action Menu State
  const [actionRuns, setActionRuns] = useState<ActionRunRecord[]>([]);
  const [expandedRunIds, setExpandedRunIds] = useState<Record<string, boolean>>({});
    const [windowEvents, setWindowEvents] = useState<WindowEvent[]>([]);
    const layoutRestoringRef = useRef(false);
    const WINDOW_LAYOUT_KEY = 'fole.windowLayout.v1';

  const applyDraft = (draft: BundleResponse) => {
       if (!lastActiveBundle) {
           setLastActiveBundle(deepClone(bundleData) as BundleResponse);
       }
       setBundleData(deepClone(draft) as BundleResponse);
       setRunningSource('DRAFT');
       setLastConfigEvent({ kind: 'APPLY', ts: Date.now() });
  };

  const rollbackActive = () => {
      if (lastActiveBundle) {
          setBundleData(deepClone(lastActiveBundle) as BundleResponse);
          setRunningSource('ACTIVE');
          setLastConfigEvent({ kind: 'ROLLBACK', ts: Date.now() });
      }
  };

  const toggleRunLogs = (id: string) => setExpandedRunIds(prev => ({...prev, [id]: !prev[id]}));

  const recordWindowEvent = (kind: WindowEvent['kind'], windowId: string) => {
      const evt: WindowEvent = {
          ts: new Date().toISOString(),
          kind,
          windowId
      };
      setWindowEvents(prev => [evt, ...prev].slice(0, 50));
  };

  // Sync state helper
  const syncRuntime = () => {
    const snapshot = runtimeRef.current.getSnapshot();
    setRuntimePlan(snapshot);
    if (!layoutRestoringRef.current) {
        try {
            const layout = serializeWindowLayout({
                windows: snapshot.windows || {},
                focusedWindowId: snapshot.focusedWindowId ?? null
            });
            localStorage.setItem(WINDOW_LAYOUT_KEY, JSON.stringify(layout));
        } catch (e) {
            // ignore persistence errors
        }
    }
  };

  const restoreWindowLayout = () => {
      try {
          const raw = localStorage.getItem(WINDOW_LAYOUT_KEY);
          const parsed = deserializeWindowLayout(raw);
          if (!parsed) return false;
          const available = runtimeRef.current.getSnapshot().availableWindows || {};
          const filtered = filterLayoutByAvailableWindows(parsed, new Set(Object.keys(available)));
          runtimeRef.current.restoreLayout(filtered);
          return true;
      } catch {
          return false;
      }
  };

  const openWindowWithTelemetry = (windowId: string) => {
      const prevSnapshot = runtimeRef.current.getSnapshot();
      const wasOpen = !!prevSnapshot.windows[windowId];
      const prevFocusedId = prevSnapshot.focusedWindowId ?? null;
      runtimeRef.current.openWindow(windowId);
      syncRuntime();
      const nextSnapshot = runtimeRef.current.getSnapshot();
      const nowOpen = !!nextSnapshot.windows[windowId];
      const nextFocusedId = nextSnapshot.focusedWindowId ?? null;
      if (!wasOpen && nowOpen) {
          recordWindowEvent('window.opened', windowId);
      }
      if (prevFocusedId !== nextFocusedId && nextFocusedId) {
          recordWindowEvent('window.focused', nextFocusedId);
      }
  };

  const focusWindowWithTelemetry = (windowId: string) => {
      const prevFocusedId = runtimeRef.current.getSnapshot().focusedWindowId ?? null;
      runtimeRef.current.focusWindow(windowId);
      syncRuntime();
      const nextFocusedId = runtimeRef.current.getSnapshot().focusedWindowId ?? null;
      if (prevFocusedId !== nextFocusedId && nextFocusedId) {
          recordWindowEvent('window.focused', nextFocusedId);
      }
  };

  const closeWindowWithTelemetry = (windowId: string) => {
      const prevSnapshot = runtimeRef.current.getSnapshot();
      const wasOpen = !!prevSnapshot.windows[windowId];
      const prevFocusedId = prevSnapshot.focusedWindowId ?? null;
      runtimeRef.current.closeWindow(windowId);
      syncRuntime();
      const nextFocusedId = runtimeRef.current.getSnapshot().focusedWindowId ?? null;
      if (wasOpen) {
          recordWindowEvent('window.closed', windowId);
      }
      if (prevFocusedId !== nextFocusedId && nextFocusedId) {
          recordWindowEvent('window.focused', nextFocusedId);
      }
  };

  const clearWindowEvents = () => setWindowEvents([]);

  // Initialize Runtime when bundle loads
  useEffect(() => {
    if (bundleData) {
        let width = 800; // Default fallback
        let height = 600;
        if (viewportRef.current) {
            width = viewportRef.current.clientWidth;
            height = viewportRef.current.clientHeight;
        }

        const effectivePing = pingData ?? { allowed: false, status: 0, targetBlockId: undefined };
        runtimeRef.current.init(bundleData, effectivePing as PingResponse, width, height);
        layoutRestoringRef.current = true;
        restoreWindowLayout();
        syncRuntime();
        layoutRestoringRef.current = false;
    }
  }, [bundleData, pingData]);

  const resetWindowLayout = () => {
      try {
          localStorage.removeItem(WINDOW_LAYOUT_KEY);
      } catch {
          // ignore
      }
      runtimeRef.current.closeAllWindows();
      syncRuntime();
  };

  const closeAllWindows = () => {
      runtimeRef.current.closeAllWindows();
      syncRuntime();
  };

  // Handle Esc for overlays
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            runtimeRef.current.dismissTop();
            syncRuntime();
        }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const fetchBundle = async () => {
    setLoading(true);
    setError(null);
    setBundleData(null);
    try {
      const bundleRes = await fetch(apiUrl('/api/config/shell/bundle'));
      if (!bundleRes.ok) {
        const txt = await bundleRes.text().catch(() => '');
        throw new Error(`Bundle fetch failed: ${bundleRes.status} ${bundleRes.statusText} ${txt}`);
      }
      const rawJson = await bundleRes.json();
      
      // FIX: Robustly find the bundle payload
      // 1. { bundle: { manifest: {}, blocks: {} } } (Standard wrapped)
      // 2. { manifest: {}, blocks: {} } (Direct)
      // 3. { data: { bundle: ... } } (Some API wrappers)
      const bundleObj = rawJson?.bundle?.bundle ?? rawJson?.bundle ?? rawJson?.data?.bundle ?? rawJson;

      if (!bundleObj || typeof bundleObj !== 'object') {
           throw new Error("Invalid bundle format received from server (not an object)");
      }

      // Check required roots
      if (!bundleObj.manifest || !bundleObj.blocks) {
           console.warn("[FetchBundle] Received invalid bundle shape:", Object.keys(bundleObj));
           // Allow partials but warn
           if (!bundleObj.blocks) bundleObj.blocks = {};
           if (!bundleObj.manifest) bundleObj.manifest = { title: "Invalid Manifest" };
      }

      setBundleData(bundleObj);
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const resolvePing = async () => {
    // PRE-CHECK: Prevent 404 noise if ping route is clearly disabled in active config
    if (bundleData && bundleData.blocks) {
       const blocks = bundleData.blocks as any;
       // Find infra_routing block (usually shell.infra.routing)
       const routingBlock = Object.values(blocks).find((b:any) => b.blockType === 'shell.infra.routing') as any;
       if (routingBlock && routingBlock.data && routingBlock.data.routes) {
          const pingRoute = routingBlock.data.routes.ping;
          if (!pingRoute || pingRoute.enabled === false) {
              setLoading(false);
              setPingData(null);
              setError("Ping route not configured in active bundle (infra_routing.routes.ping missing or disabled).");
              return;
          }
       }
    }

    setLoading(true);
    setError(null);
    setPingData(null);
    try {
      const pingRes = await fetch(apiUrl('/api/routing/resolve/ping'));
      
      // Special handling for 404 to distinguish missing route from server error
      if (pingRes.status === 404) {
          try {
             // Clone since we might need to read it again (though we return if matched)
             const body = await pingRes.clone().json();
             const reason = body.reason || '';
             
             if (
                 reason.includes('Route not found') || 
                 reason.includes('disabled') || 
                 (body.allowed === false && body.status === 404)
             ) {
                 setError("Ping route not configured in active bundle (infra_routing.routes.ping missing or disabled).");
                 return;
             }
          } catch {
             // If body isn't JSON or other error, fall through to generic handler
          }
      }

      if (!pingRes.ok && pingRes.status !== 401 && pingRes.status !== 403) {
         throw new Error(`Ping failed: ${pingRes.status} ${pingRes.statusText}`);
      }
      const pingJson = await pingRes.json();
      setPingData(pingJson);
      
      // Auto-open menu logic removed
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDispatch = async (override?: {sourceBlockId: string, actionName: string, permissions?: string[]}): Promise<ActionDispatchResult> => {
    // Gate manual debug dispatch
    if (!caps.debugEndpointsEnabled) {
        const err: ActionDispatchResult = {
            applied: 0, skipped: 0, logs: [],
            error: "Debug endpoints disabled. Cannot dispatch."
        };
        setActionResult(err);
        return err;
    }

    setLoading(true);
    setActionResult(null);
    try {
      const permsArray = override?.permissions ?? actionPerms.split(',').map(s => s.trim()).filter(Boolean);
      const reqBody = {
           sourceBlockId: override?.sourceBlockId ?? sourceBlockId,
           actionName: override?.actionName ?? actionName,
           permissions: permsArray
      };
      
      const res = await debugFetch('/api/debug/action/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody)
      });
      
      if (!res) {
          const err: ActionDispatchResult = {
              applied: 0, skipped: 0, logs: [],
              error: "Dispatch call failed (no response)."
          };
          setActionResult(err);
          return err;
      }

      if (res.status === 403) {
        const err: ActionDispatchResult = { 
            applied: 0, skipped: 0, logs: [], 
            error: "Access Denied (403): Use FOLE_DEV_ENABLE_DEBUG_ENDPOINTS=1 env var" 
        };
        setActionResult(err);
        return err;
      }

      if (!res.ok) {
           const err: ActionDispatchResult = {
               applied: 0, skipped: 0, logs: [],
               error: `HTTP Error ${res.status} ${res.statusText}`
           };
           setActionResult(err);
           return err;
      }

      const raw = await res.json() as { applied?: unknown; skipped?: unknown; logs?: unknown; error?: unknown };
      const data: ActionDispatchResult = {
          applied: typeof raw.applied === 'number' ? raw.applied : 0,
          skipped: typeof raw.skipped === 'number' ? raw.skipped : 0,
          logs: Array.isArray(raw.logs) ? (raw.logs as string[]) : [],
          error: typeof raw.error === 'string' ? raw.error : undefined
      };
      
      setActionResult(data);
      return data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const errObj: ActionDispatchResult = { 
          applied: 0, skipped: 0, logs: [msg], 
          error: msg 
      };
      setActionResult(errObj);
      return errObj;
    } finally {
      setLoading(false);
    }
  };

    const runAction = async (def: ActionDefinition | string) => {
      // Resolve ID
      const actionId = typeof def === 'string' ? def : def?.id;

      // 0. Manual Legacy Mapping (Removed generic type check, resolving by block)
      if (bundleData?.blocks) {
          // Resolve block by actionId directly
          const blocks = bundleData.blocks as Record<string, any>;
          const block = blocks[actionId];
             if (block && block.blockType === 'action.openWindow' && block.data?.windowId) {
                 openWindowWithTelemetry(block.data.windowId);
             
              const localResult: ActionDispatchResult = {
                  applied: 1, skipped: 0, logs: [`Open Window Action: ${block.data.windowId}`]
              };
              const record: ActionRunRecord = {
                  id: Date.now().toString(),
                  timestamp: Date.now(),
                  actionId: typeof def === 'string' ? def : `${def.sourceBlockId}::${def.actionName}`,
                  result: localResult
              };
              setActionRuns(prev => [record, ...prev].slice(0, 50));
              return;
          }
           
           if (!block && typeof def !== 'string') {
               // Fallback: If passed as definition but not found as block, try sourceBlockId logic for legacy
           } else if (!block) {
                const errResult: ActionDispatchResult = {
                  applied: 0, skipped: 1, logs: [],
                  error: `Action Block Not Found: ${actionId}`
              };
              setActionResult(errResult);
              return;
           }
      }

      if (typeof def === 'string') return; // Cannot dispatch string-only legacy actions yet

      // 1. Run Dispatch
      const result = await handleDispatch({
          sourceBlockId: def.sourceBlockId,
          actionName: def.actionName,
          permissions: ['can_click'] // Default permission for menu clicks
      });

      // 2. Log Result
      const record: ActionRunRecord = {
          id: Date.now().toString(),
          timestamp: Date.now(),
          actionId: `${def.sourceBlockId}::${def.actionName}`,
          result
      };
      setActionRuns(prev => [record, ...prev].slice(0, 50)); 
  };

  const handleV2Action = async (actionId: string, sourceBlockId?: string) => {
      const blocks = bundleData?.blocks as Record<string, any> | undefined;
      const block = blocks?.[actionId];
      let localResult: ActionDispatchResult | null = null;

      if (block && block.blockType === 'action.openWindow' && typeof block.data?.windowId === 'string') {
          openWindowWithTelemetry(block.data.windowId);
          localResult = {
              applied: 1,
              skipped: 0,
              logs: [`Open Window Action: ${block.data.windowId}`]
          };
      }

      try {
          const nodeId = sourceBlockId || actionId;
          const res = await fetch(apiUrl('/api/actions/dispatch'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ actionId, nodeId })
          });
          if (!res.ok) {
              localResult = localResult ?? {
                  applied: 0,
                  skipped: 1,
                  logs: [],
                  error: `Action dispatch failed: ${res.status}`
              };
          }
      } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          localResult = localResult ?? {
              applied: 0,
              skipped: 1,
              logs: [],
              error: `Action dispatch error: ${msg}`
          };
      }

      if (localResult) {
          const record: ActionRunRecord = {
              id: Date.now().toString(),
              timestamp: Date.now(),
              actionId: sourceBlockId ? `${sourceBlockId}::${actionId}` : actionId,
              result: localResult
          };
          setActionRuns(prev => [record, ...prev].slice(0, 50));
      }
  };

  const { headerRightItems, headerLeftItems } = useMemo(() => {
     if (!bundleData?.blocks) return { headerRightItems: [], headerLeftItems: [] };
     const blocks = Array.isArray(bundleData.blocks) 
        ? bundleData.blocks 
        : typeof bundleData.blocks === 'object' && bundleData.blocks 
           ? Object.values(bundleData.blocks) 
           : [];
           
     const right: any[] = [];
     const left: any[] = [];

     blocks.forEach((b: any) => {
         if (b.blockType === 'shell.slot.item') {
             if (b.data?.slotId === 'app.header.right') right.push(b);
             else if (b.data?.slotId === 'app.header.left') left.push(b);
         }
     });

     // Deterministic Sort: Order first (asc), then Block ID (asc)
     const sorter = (a: any, b: any) => {
         // Default to 0 if order is missing
         const oa = typeof a.data?.order === 'number' ? a.data.order : 0;
         const ob = typeof b.data?.order === 'number' ? b.data.order : 0;
         
         if (oa !== ob) return oa - ob;
         // Fallback to stable ID sort
         return (a.blockId || '').localeCompare(b.blockId || '');
     };

     right.sort(sorter);
     left.sort(sorter);

     return { headerRightItems: right, headerLeftItems: left };
  }, [bundleData]);

  const regions = useMemo(() => {
      if (!bundleData) return { header: null, viewport: null, footer: null };
      const manifest = bundleData.manifest as any;
      const blocks = bundleData.blocks as any;
      
      const resolve = (keys: string[]) => {
          let id = null;
          // Alias Support: Check keys in order (e.g. header -> top)
          for (const k of keys) {
              const regionDef = manifest?.regions?.[k];
              if (regionDef) {
                  // Direct ID or object wrapper
                  const candidate = (typeof regionDef === 'object' && regionDef.blockId) 
                      ? regionDef.blockId 
                      : (typeof regionDef === 'string' ? regionDef : null);
                  
                  if (candidate) {
                      id = candidate;
                      break; 
                  }
              }
          }
          
          if (id && blocks && blocks[id]) {
              return blocks[id];
          }
          return null;
      };
      
      return {
          header: resolve(['header', 'top']),
          viewport: resolve(['viewport', 'main']),
          footer: resolve(['footer', 'bottom'])
      };
  }, [bundleData]);

  // UI Handlers wiring to Runtime
  const winOps = {
      focus: (id: string) => { focusWindowWithTelemetry(id); },
      move: (id: string, x: number, y: number) => { runtimeRef.current.moveWindow(id, x, y); syncRuntime(); },
      resize: (id: string, w: number, h: number) => { runtimeRef.current.resizeWindow(id, w, h); syncRuntime(); },
      close: (id: string) => { closeWindowWithTelemetry(id); },
      minimize: (id: string, v: boolean) => { runtimeRef.current.setMinimized(id, v); syncRuntime(); },
      dock: (id: string, m: WindowState['dockMode']) => { runtimeRef.current.dockWindow(id, m); syncRuntime(); }
  };
    void winOps;

  const overlayOps = {
      open: (id: string) => { runtimeRef.current.setOverlayOpen(id, true); syncRuntime(); },
      close: (id: string) => { runtimeRef.current.setOverlayOpen(id, false); syncRuntime(); },
      dismiss: () => { runtimeRef.current.dismissTop(); syncRuntime(); }
  };

  return (
    <CapabilitiesContext.Provider value={caps}>
    <div style={{ padding: '20px', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', overflow: 'hidden', boxSizing:'border-box' }}>
      <h1>ShellRuntime Bootstrap UI</h1>
      
      {/* Top Controls */}
      <div style={{ marginBottom: '10px', border: '1px solid #ccc', padding: '10px', flexShrink: 0 }}>
        <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
            <strong>Setup:</strong>
            <button onClick={fetchBundle} disabled={loading}>1. Fetch Bundle</button>
            <button onClick={resolvePing} disabled={loading || !bundleData}>2. Resolve Ping</button>
            <span>{loading ? '(Loading...)' : ''}</span>
            <span style={{color: error ? 'red': 'black'}}>{error}</span>
        </div>
      </div>

      {/* App Header Region Removed - Moved to Shell Container */}


      <div style={{display:'flex', gap:'20px', flex:1, width: '100%', height:'100%', overflow:'hidden'}}>
          
          {/* Left Panel: Logic & Debug */}
          <div style={{width: '300px', overflowY: 'auto', borderRight: '1px solid #ddd', paddingRight:'10px'}}>
             {canUseDebugUi ? <h4>Debug Controls</h4> : <h4>System</h4>}
             <div style={{marginBottom:'20px'}}>
                {canUseDebugUi && (
                    <>
                        <input type="text" placeholder="Block ID" value={sourceBlockId} onChange={e=>setSourceBlockId(e.target.value)} style={{width:'100%'}}/>
                        <input type="text" placeholder="Action (e.g. click)" value={actionName} onChange={e=>setActionName(e.target.value)} style={{width:'100%', marginTop:'5px'}}/>
                        <input type="text" placeholder="Permissions" value={actionPerms} onChange={e=>setActionPerms(e.target.value)} style={{width:'100%', marginTop:'5px'}}/>
                        <button onClick={() => { void handleDispatch(); }} style={{marginTop:'5px', width:'100%'}}>Dispatch Action</button>
                    </>
                )}
                <button onClick={() => setSysadminOpen(!sysadminOpen)} style={{marginTop:'10px', width:'100%', background: sysadminOpen ? '#333' : '#eee', color: sysadminOpen ? 'white' : 'black'}}>
                    {sysadminOpen ? 'Close Sysadmin' : 'Open Sysadmin'}
                </button>
                
                <div style={{marginTop:'10px', padding:'5px', border:'1px dashed #ccc', display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:'0.8em'}}>
                    <span title="Forces safe theme for admin UI if styling becomes unreadable.">Safe Mode</span>
                    <label style={{display:'flex', alignItems:'center', gap:'5px', cursor:'pointer'}}>
                        <input type="checkbox" checked={safeModeEnabled} onChange={e => setSafeModeEnabled(e.target.checked)} />
                        {safeModeEnabled ? 'ON' : 'OFF'}
                    </label>
                </div>

                <button onClick={() => setShowV2(true)} style={{marginTop:'5px', width:'100%', background:'#e3f2fd', color: '#0d47a1'}}>
                    V2 Renderer Preview
                </button>

                {canUseDebugUi && (
                    <>
                        <button 
                        onClick={() => {
                            if (runtimePlan && runtimePlan.overlays && runtimePlan.overlays['overlay_menu']) {
                                overlayOps.open('overlay_menu');
                            } else {
                                console.warn("overlay_menu not available in current plan");
                            }
                        }}
                        style={{marginTop:'5px', width:'100%', background:'#ffebee', color: '#b71c1c', border:'1px solid #ef5350', cursor:'pointer', fontSize:'0.9em', fontWeight: 'bold'}}
                        title="Force open standard menu overlay if available"
                        >
                        Force open overlay_menu
                        </button>
                    </>
                )}
                {!!actionResult && <pre style={{
                    fontSize:'10px',
                    background:'#f7f7f7',
                    color: '#111',
                    padding:'5px',
                    border: '1px solid #ddd',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily: 'monospace'
                }}>{JSON.stringify(actionResult, null, 2)}</pre>}
             </div>

             <h4>Available Windows</h4>

             <ul>
                 {runtimePlan && runtimePlan.availableWindows && Object.entries(runtimePlan.availableWindows).map(([id, def]) => (
                     <li key={id} style={{fontSize:'0.9em'}}>
                         <span>{id}</span>
                         {def?.title && def.title !== id && <span style={{marginLeft:'6px', color:'#666'}}>({def.title})</span>}
                         <button
                             onClick={() => { openWindowWithTelemetry(id); }}
                             style={{marginLeft:'6px', fontSize:'0.7em'}}
                         >
                             Open
                         </button>
                     </li>
                 ))}
             </ul>

             <h4>Available Overlays</h4>
             <ul>
                 {runtimePlan && Object.values(runtimePlan.overlays).map(o => (
                     <li key={o.id} style={{fontSize:'0.9em'}}>
                         {o.id} [{o.isOpen ? 'OPEN' : 'closed'}]
                         <button onClick={() => overlayOps.open(o.id)} style={{marginLeft:'5px', fontSize:'0.7em'}}>Open</button>
                     </li>
                 ))}
             </ul>

             <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                 <h4>Action History</h4>
                 <button 
                    onClick={() => { setActionRuns([]); setExpandedRunIds({}); }}
                    style={{
                        padding:'2px 6px', fontSize:'0.75em', background:'#fff', color:'#333', border:'1px solid #ccc', borderRadius:'3px', cursor:'pointer'
                    }}
                    title="Clear all action history logs"
                 >
                    Clear
                 </button>
             </div>
             <ul style={{ paddingLeft: '0', listStyle: 'none' }}>
                {actionRuns.map(run => {
                    const status = getActionStatus(run.result);
                    return (
                    <li key={run.id} style={{ marginBottom: '10px', borderBottom: '1px solid #eee', paddingBottom: '5px' }}>
                        <div style={{ fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                           <span>{run.actionId}</span>
                           <span style={{ fontWeight: 'normal', color: '#999' }}>{new Date(run.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div style={{ color: getStatusColor(status), margin: '2px 0', fontWeight:'bold' }}>
                            {status}
                        </div>
                        
                        <div style={{ fontSize: '0.9em' }}>
                            <span>Applied: {run.result.applied} | Skipped: {run.result.skipped}</span>
                            
                            {(run.result.logs.length > 0 || run.result.error) && (
                                <div style={{ marginTop: '2px' }}>
                                    <button 
                                        type="button"
                                        onClick={() => toggleRunLogs(run.id)}
                                        style={{ cursor: 'pointer', fontSize: '0.9em', border: 'none', background: 'none', color: '#007acc', padding: 0, textDecoration: 'underline' }}
                                    >
                                        {expandedRunIds[run.id] ? 'Hide Details' : 'Show Details'}
                                    </button>
                                    
                                    {expandedRunIds[run.id] && <LogViewer result={run.result} />}
                                </div>
                            )}
                        </div>
                    </li>
                    );
                })}
                {actionRuns.length === 0 && (
                    <li><span style={{ color: '#999' }}>No actions run yet.</span></li>
                )}
             </ul>
          </div>

          {/* Right Panel: Shell Surface */}
          <div style={{flex:1, display:'flex', flexDirection:'column', height:'100%', minWidth: 0, border:'2px solid #333', borderRadius:'4px', overflow:'hidden', backgroundColor: '#333'}}>
             
             {/* Shell Header */}
             {regions.header && (
                 <div style={{
                     height: '48px',
                     backgroundColor: '#2b2b2b',
                     color: '#eee',
                     display: 'flex',
                     alignItems: 'center',
                     padding: '0 15px',
                     borderBottom: '1px solid #444',
                     justifyContent: 'space-between',
                     flexShrink: 0
                 }}>
                    {/* Left Group: Title + Left Slots */}
                    <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
                        <div style={{fontWeight: 'bold', fontSize: '1.1em'}}>{regions.header.data?.title || "Fole App"}</div>
                        
                        {headerLeftItems.length > 0 && (
                            <div style={{display:'flex', gap:'8px', alignItems:'center'}}>
                                {headerLeftItems.map((item: any) => {
                                    const label = item.data?.label || item.blockId;
                                    return (
                                        <button key={item.blockId} 
                                            onClick={() => { if(item.data?.actionId) runAction(item.data.actionId); }} 
                                            style={{ fontWeight: 'bold', background: '#444', color: '#eee', border: '1px solid #666', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize:'0.85em' }}>
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Right Group: Right Slots */}
                    <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
                        {headerRightItems.map((item: any) => {
                            const label = item.data?.label || item.blockId;
                            return (
                                <button key={item.blockId} 
                                    onClick={() => { if(item.data?.actionId) runAction(item.data.actionId); }} 
                                    style={{ fontWeight: 'bold', background: '#007acc', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                 </div>
             )}

             {/* Shell Viewport */}
             <div ref={viewportRef} style={{flex:1, display: 'flex', flexDirection: 'column', position:'relative', backgroundColor:'#f0f0f0', overflow:'hidden'}}>
                 { regions.viewport?.data?.contentRootId && (
                     <div style={{flex: 1, width:'100%', overflow:'hidden', position:'relative'}}>
                        <V2RendererPreview embedded rootId={regions.viewport.data.contentRootId} onAction={handleV2Action} />
                     </div>
                 )}
                 
                      {/* Runtime Windows Layer */}
                      {runtimePlan && (() => {
                          const windowsList = Object.values(runtimePlan.windows || {});
                          const focusedWindowId = runtimePlan.focusedWindowId ?? null;

                          return windowsList.map(win => {
                    const blocks = bundleData?.blocks || {};
                    const block = (blocks[win.id] || Object.values(blocks).find((b: any) => b.id === win.id)) as any;
                    const contentRoot = block?.data?.children?.[0]?.blockId;
                    
                    return (
                     <WindowFrame
                        key={win.id}
                        win={win}
                        isFocused={focusedWindowId === win.id}
                                onFocus={() => { focusWindowWithTelemetry(win.id); }}
                        onMove={(x,y) => { runtimeRef.current.moveWindow(win.id, x, y); syncRuntime(); }}
                        onResize={(w,h) => { runtimeRef.current.resizeWindow(win.id, w, h); syncRuntime(); }}
                                onClose={() => { closeWindowWithTelemetry(win.id); }}
                        onMinimize={(m) => { runtimeRef.current.setMinimized(win.id, m); syncRuntime(); }}
                        onDock={(m) => { runtimeRef.current.dockWindow(win.id, m); syncRuntime(); }}
                     >
                        {contentRoot ? (
                            <V2RendererPreview embedded rootId={contentRoot} onAction={handleV2Action} />
                        ) : (
                           <div style={{padding:'20px', color:'#666', fontStyle:'italic'}}>
                              No content configured.
                           </div>
                        )}
                     </WindowFrame>
                    );
                          });
                      })()}

                 <SysadminPanel 
                     isOpen={sysadminOpen} 
                     onClose={() => setSysadminOpen(false)}
                     bundleData={bundleData}
                     runtimePlan={runtimePlan}
                     runningSource={runningSource}
                     lastConfigEvent={lastConfigEvent}
                     onApplyDraft={applyDraft}
                     onRollback={rollbackActive}
                     canRollback={!!lastActiveBundle && runningSource === 'DRAFT'}
                     onRefresh={fetchBundle}
                     safeModeEnabled={safeModeEnabled}
                     windowEvents={windowEvents}
                     onClearWindowEvents={clearWindowEvents}
                     onResetWindowLayout={resetWindowLayout}
                     onCloseAllWindows={closeAllWindows}
                     onOpenWindow={openWindowWithTelemetry}
                     onFocusWindow={focusWindowWithTelemetry}
                     onCloseWindow={closeWindowWithTelemetry}
                 />
             </div>

             {/* Shell Footer */}
             {regions.footer && (
                 <div style={{
                     height: '24px',
                     backgroundColor: '#eee',
                     borderTop: '1px solid #ccc',
                     display: 'flex',
                     alignItems: 'center',
                     padding: '0 10px',
                     fontSize: '0.8rem',
                     color: '#555',
                     flexShrink: 0
                 }}>
                     {regions.footer.data?.copyrightText || regions.footer.blockId }
                 </div>
             )}
          </div>
      </div>
    {showV2 && <V2RendererPreview onClose={() => setShowV2(false)} onAction={handleV2Action} />}
    </div>
    </CapabilitiesContext.Provider>
  );
}

function FeaturesSlotsView({ features, slotsById }: { features: any[], slotsById: Record<string, any[]> }) {
    const [selectedBlock, setSelectedBlock] = useState<any>(null);

    return (
        <div style={{display:'flex', height:'100%'}}>
             <div style={{width:'300px', borderRight:'1px solid #ddd', overflowY:'auto', padding:'10px', background:'#fff'}}>
                <h4 style={{marginTop:0, marginBottom:'10px', borderBottom:'1px solid #eee', paddingBottom:'5px'}}>Feature Groups ({features.length})</h4>
                {features.map(f => (
                    <div 
                        key={f.blockId} 
                        onClick={() => setSelectedBlock(f)}
                        style={{
                            padding:'5px', cursor:'pointer', marginBottom:'5px',
                            background: selectedBlock===f ? '#e3f2fd' : '#f9f9f9',
                            border: '1px solid #eee', borderRadius:'3px'
                        }}
                    >
                        <div style={{fontWeight:'bold', fontSize:'0.9em'}}>{f.data?.title || f.blockId}</div>
                        <div style={{fontSize:'0.75em', color:'#666'}}>{f.data?.id}</div>
                    </div>
                ))}
                
                <h4 style={{marginTop:'20px', marginBottom:'10px', borderBottom:'1px solid #eee', paddingBottom:'5px'}}>Slot Items</h4>
                {Object.keys(slotsById).map(slotId => (
                    <div key={slotId} style={{marginBottom:'10px'}}>
                        <div style={{fontSize:'0.8em', fontWeight:'bold', color:'#555', marginBottom:'3px'}}>Slot: {slotId}</div>
                        {slotsById[slotId].map(s => (
                            <div 
                                key={s.blockId}
                                onClick={() => setSelectedBlock(s)}
                                style={{
                                    padding:'5px', cursor:'pointer', marginBottom:'3px', marginLeft:'5px',
                                    background: selectedBlock===s ? '#e3f2fd' : '#f9f9f9',
                                    border: '1px solid #eee', borderRadius:'3px'
                                }}
                            >
                                <div style={{fontSize:'0.9em'}}>{s.data?.label || s.blockId}</div>
                                <div style={{fontSize:'0.75em', color:'#666'}}>Action: {s.data?.actionId}</div>
                            </div>
                        ))}
                    </div>
                ))}
             </div>
             
             <div style={{flex:1, padding:'10px', overflow:'hidden', display:'flex', flexDirection:'column', background:'#fafafa'}}>
                 {selectedBlock ? (
                     <>
                        <div style={{marginBottom:'10px', paddingBottom:'10px', borderBottom:'1px solid #ddd'}}>
                            <strong>{selectedBlock.blockType}</strong>: {selectedBlock.blockId}
                        </div>
                        <pre style={{
                            flex:1, overflow:'auto', background:'#fff', padding:'10px', 
                            border:'1px solid #ccc', borderRadius:'4px', fontSize:'0.85em'
                        }}>
                            {JSON.stringify(selectedBlock, null, 2)}
                        </pre>
                     </>
                 ) : (
                     <div style={{color:'#999', marginTop:'50px', textAlign:'center'}}>Select a block to view details</div>
                 )}
             </div>
        </div>
    );
}

export default App;
