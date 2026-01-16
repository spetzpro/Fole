import { useState, useEffect, useRef, useMemo } from 'react';
import './App.css';

type UnknownRecord = Record<string, unknown>;

interface PingResponse {
  allowed: boolean;
  status: number;
  targetBlockId?: string;
}

interface BundleResponse {
  manifest: unknown;
  blocks: Record<string, unknown>;
}

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

interface ActionRunRecord {
  id: string;
  timestamp: number;
  actionId: string;
  result: ActionDispatchResult;
}

interface RuntimePlan {
  entrySlug: string;
  targetBlockId: string;
  windows: Record<string, WindowState>;
  overlays: Record<string, OverlayState>;
  actions: ActionDefinition[];
}

// --- Simulated Runtime Class (Stateful, held in Ref) ---
class WindowSystemRuntime {
  private windows: Map<string, WindowState> = new Map();
  private overlays: Map<string, OverlayState> = new Map();
  private actions: ActionDefinition[] = [];
  private entrySlug: string = '';
  private targetBlockId: string = '';
  private zCounter: number = 100;

  constructor() {}

  public init(bundle: BundleResponse, ping: PingResponse, viewWidth: number = 900, viewHeight: number = 600) {
    this.entrySlug = 'ping';
    this.targetBlockId = ping.targetBlockId || 'unknown';
    this.windows.clear();
    this.overlays.clear();
    this.actions = [];
    this.zCounter = 100;

    const blocks = bundle.blocks || {};
    let blocksArray: unknown[] = [];
    
    if (Array.isArray(blocks)) {
        blocksArray = blocks;
    } else if (typeof blocks === 'object' && blocks !== null) {
        blocksArray = Object.values(blocks);
    }

    const minVisibleW = 100;
    const minVisibleH = 50;

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
      } else if (blockType.includes('window') || blockId.includes('win') || blockType.includes('panel')) {
         // Default Window Layout
         const startX = 50 + (this.windows.size * 30);
         const startY = 50 + (this.windows.size * 30);

         this.windows.set(blockId, {
            id: blockId,
            title,
            x: Math.max(0, Math.min(startX, viewWidth - minVisibleW)),
            y: Math.max(0, Math.min(startY, viewHeight - minVisibleH)),
            width: 400,
            height: 300,
            isMinimized: false,
            dockMode: 'none',
            zOrder: this.zCounter++
         });
      }
    });

    // 2. Build Actions
    const actionIdx: ActionDefinition[] = [];
    blocksArray.forEach((block: unknown) => {
        if (!block || typeof block !== 'object') return;
        const b = block as Record<string, unknown>;

       const blockType = typeof b.blockType === 'string' ? b.blockType : '';
       const blockId = (typeof b.id === 'string' ? b.id : '') || (typeof b.blockId === 'string' ? b.blockId : '');
       if (!blockId) return;

       // Check top-level actions or data.actions
       let actionsList: unknown[] = [];
       if (Array.isArray(b.actions)) {
           actionsList = b.actions;
       } else if (b.data && typeof b.data === 'object' && Array.isArray((b.data as Record<string, unknown>).actions)) {
           actionsList = (b.data as Record<string, unknown>).actions as unknown[];
       }

       if (actionsList.length > 0) {
          actionsList.forEach((act: unknown) => {
             if (typeof act === 'string') {
                 actionIdx.push({ id: `${blockId}:${act}`, actionName: act, sourceBlockId: blockId });
             }
          });
       } else if (blockType.includes('button')) {
          actionIdx.push({ id: `${blockId}:click`, actionName: 'click', sourceBlockId: blockId });
       }
    });
    this.actions = actionIdx;
  }

  // --- Window Operations ---
  public focusWindow(id: string) {
    const w = this.windows.get(id);
    if (!w) return;
    w.zOrder = ++this.zCounter;
    this.windows.set(id, { ...w });
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
       overlays: Object.fromEntries(this.overlays),
       actions: this.actions
    };
  }
}

// --- Components ---

function WindowFrame({ 
    win, 
    onFocus, 
    onMove, 
    onResize, 
    onClose, 
    onMinimize, 
    onDock 
}: { 
    win: WindowState,
    onFocus: () => void,
    onMove: (x: number, y: number) => void,
    onResize: (w: number, h: number) => void,
    onClose: () => void,
    onMinimize: (val: boolean) => void,
    onDock: (mode: WindowState['dockMode']) => void
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
        if (win.isMinimized) return;
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startY = e.clientY;
        const startW = win.width;
        const startH = win.height;

        const onMouseMove = (me: MouseEvent) => {
            const dx = me.clientX - startX;
            const dy = me.clientY - startY;
            onResize(startW + dx, startH + dy);
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
                boxShadow: win.zOrder > 100 ? '0 4px 12px rgba(0,0,0,0.2)' : '0 2px 5px rgba(0,0,0,0.1)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}
        >
            {/* Title Bar */}
            <div 
                onMouseDown={startDrag}
                style={{
                    height: '30px',
                    backgroundColor: win.zOrder > 100 ? '#007acc' : '#ccc',
                    color: win.zOrder > 100 ? 'white' : '#333',
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
                <div style={{flex: 1, padding: '10px', overflow:'auto', position:'relative'}}>
                    <p>Window ID: {win.id}</p>
                    <div style={{fontSize:'0.8em', color:'#666'}}>
                        Dock: {win.dockMode} | ({Math.round(win.x)},{Math.round(win.y)})
                    </div>
                    {/* Render Content Here Later */}
                    
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

type OverlayLayerProps = { 
    overlays: OverlayState[]; 
    onClose: (id: string) => void;
    onDismissCtx: () => void;
    actions: ActionDefinition[];
    onRunAction: (def: ActionDefinition) => void;
    lastRun?: ActionRunRecord;
    expandedRunIds: Record<string, boolean>;
    onToggleRunLogs: (id: string) => void;
    actionSearch: string;
    onChangeActionSearch: (val: string) => void;
    recentRuns?: ActionRunRecord[];
};

function OverlayLayer(props: OverlayLayerProps) {
    const { overlays, onClose, onDismissCtx, actions, onRunAction, lastRun, recentRuns, expandedRunIds, onToggleRunLogs, actionSearch, onChangeActionSearch } = props;
    const [recentError, setRecentError] = useState<string | null>(null);
    
    // Persistence Key
    const PINS_KEY = 'fole.bootstrap.pinnedActionIds';

    // Initialize State from Storage
    const [pinnedActionIds, setPinnedActionIds] = useState<Set<string>>(() => {
        try {
            const raw = localStorage.getItem(PINS_KEY);
            if (!raw) return new Set();
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.every(s => typeof s === 'string')) {
                return new Set(parsed);
            }
        } catch (e) {
            // ignore bad storage
        }
        return new Set();
    });

    // Write to Storage on Change
    useEffect(() => {
        if (pinnedActionIds.size === 0) {
            localStorage.removeItem(PINS_KEY);
        } else {
            localStorage.setItem(PINS_KEY, JSON.stringify(Array.from(pinnedActionIds)));
        }
    }, [pinnedActionIds]);

    // Deduplicate recent runs (max 5)
    const uniqueRecentRuns = (() => {
        if (!recentRuns) return [];
        const unique: typeof recentRuns = [];
        const seen = new Set<string>();
        for (const r of recentRuns) {
            if (!seen.has(r.actionId)) {
                seen.add(r.actionId);
                unique.push(r);
                if (unique.length >= 5) break;
            }
        }
        return unique;
    })();
    
    const activeOverlays = overlays.filter(o => o.isOpen).sort((a,b) => a.zOrder - b.zOrder);
    if (activeOverlays.length === 0) return null;

    return (
        <>
            {activeOverlays.map(o => {
                // Check if this is a menu overlay
                const isMenu = o.blockType?.includes('overlay_menu') || o.id === 'overlay_menu' || o.id.toLowerCase().includes('menu');
                
                const q = actionSearch.trim().toLowerCase();
                const baseList = isMenu ? actions : [];
                
                // 1. All search matches
                const allMatches = (isMenu && q)
                    ? baseList.filter(a => 
                        a.id.toLowerCase().includes(q) || 
                        a.actionName.toLowerCase().includes(q) || 
                        a.sourceBlockId.toLowerCase().includes(q)
                      ) 
                    : baseList;

                // 2. Split Pinned vs Unpinned
                const pinnedMatches = allMatches.filter(a => pinnedActionIds.has(a.id));
                const unpinnedMatches = allMatches.filter(a => !pinnedActionIds.has(a.id));

                // 3. Group UNPINNED only by sourceBlockId
                const groups = new Map<string, ActionDefinition[]>();
                if (isMenu) {
                    unpinnedMatches.forEach(act => {
                        const k = act.sourceBlockId;
                        if (!groups.has(k)) groups.set(k, []);
                        groups.get(k)!.push(act);
                    });
                }
                const sortedGroupKeys = Array.from(groups.keys()).sort();

                // Helper to render action button
                const renderActionBtn = (act: ActionDefinition) => {
                    const isPinned = pinnedActionIds.has(act.id);
                    return (
                        <button 
                            key={act.id} 
                            onClick={() => onRunAction(act)}
                            style={{
                                padding:'8px', 
                                textAlign:'left', 
                                border: isPinned ? '1px solid #ff9800' : '1px solid #ccc', 
                                cursor:'pointer',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                background: isPinned ? '#fff8e1' : 'white'
                            }}
                        >
                            <strong>{act.actionName}</strong> 
                            <span 
                                onClick={(e) => { 
                                    e.stopPropagation(); 
                                    const newSet = new Set(pinnedActionIds);
                                    if (newSet.has(act.id)) newSet.delete(act.id);
                                    else newSet.add(act.id);
                                    setPinnedActionIds(newSet);
                                }} 
                                style={{ 
                                    fontSize: '1.2em', 
                                    marginLeft: '8px', 
                                    cursor: 'pointer', 
                                    lineHeight: '1', 
                                    opacity: isPinned ? 1 : 0.5 
                                }}
                                title={isPinned ? "Unpin action" : "Pin action"}
                                onMouseEnter={(e) => { if(!isPinned) e.currentTarget.style.opacity = '1'; }}
                                onMouseLeave={(e) => { if(!isPinned) e.currentTarget.style.opacity = '0.5'; }}
                            >
                                {isPinned ? '⭐' : '📌'}
                            </span>
                        </button>
                    );
                };

                return (
                    <div key={o.id} 
                        onClick={onDismissCtx}
                        style={{
                            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                            zIndex: o.zOrder,
                            backgroundColor: 'rgba(0,0,0,0.4)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                    >
                        <div 
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                backgroundColor: '#fff',
                                color: '#111',
                                border: '1px solid #ccc',
                                borderRadius: '8px',
                                padding: '12px',
                                maxWidth: 'min(720px, 90vw)',
                                maxHeight: '80vh',
                                overflowY: 'auto',
                                display: 'flex', flexDirection: 'column',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                // Keep basic sizing nicely bounded
                                width: isMenu ? 'auto' : '400px',
                                height: isMenu ? 'auto' : '300px'
                            }}
                        >
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px'}}>
                             <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                <h3 style={{margin:0}}>
                                    {isMenu ? 'Available Actions' : `Overlay: ${o.id}`}
                                </h3>
                                {isMenu && pinnedActionIds.size > 0 && (
                                    <button 
                                        onClick={() => setPinnedActionIds(new Set())}
                                        style={{
                                            fontSize:'0.75em', 
                                            background:'none', 
                                            border:'1px solid #ccc', 
                                            borderRadius:'4px', 
                                            padding:'2px 6px', 
                                            cursor:'pointer',
                                            color:'#555'
                                        }}
                                        title="Clear all pins"
                                    >
                                        Reset Pins
                                    </button>
                                )}
                             </div>
                             <button onClick={() => onClose(o.id)}>×</button>
                        </div>
                        
                        <div style={{flex:1, overflowY:'auto'}}>
                            {isMenu ? (
                                <div style={{display:'flex', flexDirection:'column', gap:'5px'}}>
                                    {uniqueRecentRuns.length > 0 && (
                                        <div style={{marginBottom:'10px'}}>
                                            <div style={{fontSize:'0.85em', fontWeight:'bold', color:'#555', marginBottom:'4px', borderBottom:'1px solid #eee'}}>
                                                Recent Actions
                                            </div>
                                            <div style={{display:'flex', flexDirection:'column', gap:'3px'}}>
                                                {uniqueRecentRuns.map(run => (
                                                    <button 
                                                        key={run.id}
                                                        onClick={() => {
                                                            setRecentError(null);
                                                            const parts = run.actionId.split('::');
                                                            const src = parts[0];
                                                            const name = parts[1];
                                                            const def = actions.find(a => a.sourceBlockId === src && a.actionName === name) 
                                                                     || actions.find(a => a.id === run.actionId);
                                                            if (def) onRunAction(def);
                                                            else setRecentError("Recent action not found in current bundle");
                                                        }}
                                                        style={{
                                                            padding:'6px 10px', 
                                                            textAlign:'left', 
                                                            border:'1px solid #555', 
                                                            borderRadius:'4px',
                                                            background:'#444', 
                                                            color: 'white',
                                                            cursor:'pointer', 
                                                            fontSize:'0.9em',
                                                            fontWeight: 'bold'
                                                        }}
                                                        onMouseEnter={e => e.currentTarget.style.background = '#333'}
                                                        onMouseLeave={e => e.currentTarget.style.background = '#444'}
                                                    >
                                                        {run.actionId}
                                                    </button>
                                                ))}
                                            </div>
                                            {recentError && <div style={{color:'#d32f2f', fontSize:'0.8em', marginTop:'2px', fontStyle:'italic'}}>{recentError}</div>}
                                            <hr style={{border:'none', borderTop:'1px solid #eee', margin:'8px 0'}} />
                                        </div>
                                    )}

                                    <input 
                                       type="text" 
                                       value={actionSearch}
                                       placeholder="Search actions..." 
                                       onChange={e => onChangeActionSearch(e.target.value)}
                                       style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '6px', marginBottom: '8px', boxSizing: 'border-box' }}
                                    />
                                    
                                    {/* Pinned Section */}
                                    {pinnedMatches.length > 0 && (
                                        <div style={{marginBottom:'10px'}}>
                                            <div style={{
                                                fontSize: '0.85em', 
                                                fontWeight: 'bold', 
                                                color: '#e65100', 
                                                marginBottom: '4px',
                                                paddingBottom: '2px', 
                                                borderBottom: '2px solid #ffcc80',
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                gap:'5px'
                                            }}>
                                                <span>Pinned</span> 
                                                <span style={{fontWeight:'normal', fontSize:'0.9em', background:'#fff3e0', padding:'0 5px', borderRadius:'10px'}}>
                                                    {pinnedMatches.length}
                                                </span>
                                            </div>
                                            <div style={{display:'flex', flexDirection:'column', gap:'5px', marginTop:'5px'}}>
                                                {pinnedMatches.map(act => renderActionBtn(act))}
                                            </div>
                                            <hr style={{border:'none', borderTop:'1px solid #eee', margin:'10px 0'}} />
                                        </div>
                                    )}

                                    {sortedGroupKeys.map(groupKey => (
                                        <div key={groupKey}>
                                            <div style={{
                                                fontSize: '0.85em', 
                                                fontWeight: 'bold', 
                                                color: '#555', 
                                                marginTop: '10px', 
                                                marginBottom: '4px',
                                                paddingBottom: '2px',
                                                borderBottom: '1px solid #eee'
                                            }}>
                                                {groupKey}
                                            </div>
                                            <div style={{display:'flex', flexDirection:'column', gap:'5px'}}>
                                                {groups.get(groupKey)!.sort((a,b) => a.actionName.localeCompare(b.actionName)).map(act => renderActionBtn(act))}
                                            </div>
                                        </div>
                                    ))}

                                    {allMatches.length === 0 && <p style={{color:'#999'}}>No actions match your search.</p>}

                                    {/* Inline Feedback in Menu */}
                                    {lastRun ? (
                                      <div style={{ marginTop: '10px', padding: '5px', background: '#eee', fontSize: '0.8em', borderLeft: '3px solid #666' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                          <strong>Last Result:</strong>
                                          <span>
                                            {lastRun.actionId}
                                            <span style={{ 
                                              marginLeft: '6px', 
                                              fontWeight: 'bold', 
                                              color: 'white', 
                                              padding: '1px 4px', 
                                              borderRadius: '3px',
                                              fontSize: '0.85em',
                                              background: getStatusColor(getActionStatus(lastRun.result))
                                            }}>
                                              {getActionStatus(lastRun.result)}
                                            </span>
                                          </span>
                                        </div>

                                        <div style={{ marginTop: '5px' }}>
                                          {lastRun.result.error ? (
                                            <span style={{ color: 'red' }}>Error: {lastRun.result.error}</span>
                                          ) : (
                                            <span style={{ color: 'green' }}>
                                              Applied: {lastRun.result.applied}, Skipped: {lastRun.result.skipped}
                                            </span>
                                          )}
                                        </div>

                                        {(lastRun.result.logs.length > 0 || lastRun.result.error) && (
                                          <div style={{ marginTop: '5px' }}>
                                            <button
                                              type="button"
                                              style={{ fontSize: '0.9em', cursor: 'pointer', textDecoration: 'underline', border: 'none', background: 'none', color: '#007acc', padding: 0 }}
                                              onClick={() => onToggleRunLogs(lastRun.id)}
                                            >
                                              {expandedRunIds[lastRun.id] ? 'Hide Details' : 'Show Details'}
                                            </button>

                                            {expandedRunIds[lastRun.id] && <LogViewer result={lastRun.result} />}
                                          </div>
                                        )}
                                      </div>
                                    ) : null}
                                </div>
                            ) : (
                                <div>Content...</div>
                            )}
                        </div>
                        
                        {!isMenu && <button onClick={() => onClose(o.id)} style={{marginTop:'10px'}}>Close Modal</button>}
                    </div>
                    </div>
                );
            })}
        </>
    );
}

// --- Shared Helpers ---
const deepClone = (obj: unknown) => {
    if (typeof structuredClone === 'function') {
        return structuredClone(obj);
    }
    return JSON.parse(JSON.stringify(obj));
};

function SysadminPanel({ 
    isOpen, 
    onClose, 
    bundleData, 
    runtimePlan, 
    actionRuns = [], 
    runningSource = 'ACTIVE',
    lastConfigEvent,
    onApplyDraft,
    onRollback,
    canRollback
}: { 
    isOpen: boolean; 
    onClose: () => void; 
    bundleData: BundleResponse | null; 
    runtimePlan: RuntimePlan | null; 
    actionRuns: ActionRunRecord[];
    runningSource?: 'ACTIVE' | 'DRAFT';
    lastConfigEvent?: { kind: 'APPLY' | 'ROLLBACK'; ts: number } | null;
    onApplyDraft: (draft: BundleResponse) => void;
    onRollback: () => void;
    canRollback: boolean;
}) {
    // Tabs: ShellConfig, Blocks, Bindings, ActionIndex, Runtime
    const [activeTab, setActiveTab] = useState('ShellConfig');
    const [filter, setFilter] = useState('');
    const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
    const [selectedBindingId, setSelectedBindingId] = useState<string | null>(null);
    const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

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

    const handleRegionChange = (slot: 'top'|'main'|'bottom', blockId: string) => {
        if (!draftBundle) return;
        const newDraft = deepClone(draftBundle) as BundleResponse;
        if (!newDraft.manifest) newDraft.manifest = { title: 'Draft Manifest' };
        if (!newDraft.manifest.regions) newDraft.manifest.regions = {};
        if (!newDraft.manifest.regions[slot]) newDraft.manifest.regions[slot] = { blockId: '' };
        
        newDraft.manifest.regions[slot].blockId = blockId;
        setDraftBundle(newDraft);
    };

    const handleCreateDraft = () => {
        if (!bundleData) {
            setDraftError("No active bundle to clone.");
            return;
        }
        try {
            const clone = deepClone(bundleData);
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
        if (!selectedBlock || !draftBundle) return;
        
        const base = selectedBlock.blockId || selectedBlock.id || draftSelectedBlockId || 'unknown';
        let newId = `${base}_copy`;
        let counter = 2;
        const blocks = (draftBundle as any).blocks || {};
        
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
        
        if (!window.confirm(`Delete block "${draftSelectedBlockId}" from Draft?`)) return;

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
            }
        });

        // Regions check
        const regions = (draftBundle as any).manifest?.regions || {};
        ['top', 'main', 'bottom'].forEach(slot => {
             const regionBid = regions[slot]?.blockId;
             if (regionBid && regionBid !== '(none)' && !blocks[regionBid]) {
                 res.warnings.push(`Region "${slot}" references missing blockId "${regionBid}"`);
             }
        });

        if (res.errors.length > 0) res.status = 'BLOCKED';
        else if (res.warnings.length > 0) res.status = 'WARNINGS';
        
        return res;
    }, [draftBundle]);

    const [showValidationDetails, setShowValidationDetails] = useState(false);
    const [showDataDiff, setShowDataDiff] = useState(false);
    
    // Safety Kit State
    const [ackWarnings, setAckWarnings] = useState(false);
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
        ['top', 'main', 'bottom'].forEach(slot => {
             const regionBid = regions[slot]?.blockId;
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


    if (!isOpen) return null;

    const tabs = ['ShellConfig', 'Blocks', 'Bindings', 'ActionIndex', 'Runtime', 'Draft'];

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
        
        switch(activeTab) {
            case 'ShellConfig': {
                if (!bundleData) return <div style={{padding:'20px', color:'#666'}}>No bundle/config loaded yet.</div>;
                return (
                    <div>
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

                 return (
                     <div style={{display:'flex', flexDirection:'column', height:'100%'}}>
                         <input 
                            type="text" 
                            placeholder="Filter blocks (id/type/filename)..." 
                            value={filter} 
                            onChange={e=>setFilter(e.target.value)} 
                            style={{width:'100%', marginBottom:'10px', padding:'6px', boxSizing:'border-box', border:'1px solid #ccc'}}
                         />
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

                 return (
                     <div style={{display:'flex', flexDirection:'column', height:'100%'}}>
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
                                        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'5px'}}>
                                            <strong style={{fontSize:'0.9em'}}>Binding Details</strong>
                                            <CopyBtn k="binding" text={selectedBinding} />
                                        </div>
                                        <pre style={preStyle}>{JSON.stringify(selectedBinding, null, 2)}</pre>
                                    </>
                                 ) : (
                                    <div style={{fontStyle:'italic', color:'#666', padding:'10px'}}>Select a binding to view details.</div>
                                 )}
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
                                             {groupedActions.get(k)?.map(a => {
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
                
                const winCount = Object.keys(runtimePlan.windows || {}).length;
                const ovCount = Object.keys(runtimePlan.overlays || {}).length;
                const actCount = (runtimePlan.actions || []).length;
                const runCount = actionRuns.length;
                
                const lastRun = actionRuns[0];
                const lastStatus = lastRun 
                    ? getActionStatus(lastRun.result)
                    : 'NONE';

                const toggleSection = (key: keyof typeof runtimeSections) => {
                    setRuntimeSections(prev => ({ ...prev, [key]: !prev[key] }));
                };

                const sectionHeaderStyle = {
                    background:'#eaeaea', 
                    padding:'8px', 
                    cursor:'pointer', 
                    fontWeight:'bold' as const, 
                    borderBottom:'1px solid #ccc',
                    display:'flex',
                    alignItems:'center',
                    justifyContent:'space-between',
                    marginTop:'10px'
                };

                const pillStyle = {
                    background:'#f0f0f0', 
                    border:'1px solid #ccc', 
                    borderRadius:'4px', 
                    padding:'5px 10px', 
                    fontSize:'0.85em', 
                    textAlign:'center' as const,
                    flex:1
                };

                return (
                    <div>
                        {/* Status Strip */}
                        <div style={{display:'flex', gap:'8px', marginBottom:'15px'}}>
                            <div style={pillStyle}>
                                <div style={{fontWeight:'bold'}}>{winCount}</div>
                                <div style={{color:'#666', fontSize:'0.9em'}}>Windows</div>
                            </div>
                            <div style={pillStyle}>
                                <div style={{fontWeight:'bold'}}>{ovCount}</div>
                                <div style={{color:'#666', fontSize:'0.9em'}}>Overlays</div>
                            </div>
                            <div style={pillStyle}>
                                <div style={{fontWeight:'bold'}}>{actCount}</div>
                                <div style={{color:'#666', fontSize:'0.9em'}}>Actions</div>
                            </div>
                            <div style={pillStyle}>
                                <div style={{fontWeight:'bold'}}>{runCount}</div>
                                <div style={{color:'#666', fontSize:'0.9em'}}>Runs</div>
                            </div>
                            {lastStatus !== 'NONE' && (
                                <div style={{...pillStyle, background: '#fafafa', borderColor: '#ccc'}}>
                                    <div style={{fontWeight:'bold', color: getStatusColor(lastStatus)}}>{lastStatus}</div>
                                    <div style={{color:'#666', fontSize:'0.9em'}}>Last Result</div>
                                </div>
                            )}
                        </div>

                        {/* Windows Section */}
                        <div style={sectionHeaderStyle} onClick={() => toggleSection('windows')}>
                            <span>Windows</span>
                            <span>{runtimeSections.windows ? '▾' : '▸'}</span>
                        </div>
                        {runtimeSections.windows && (
                            <div style={{padding:'10px', border:'1px solid #eee', borderTop:'none'}}>
                                {winCount === 0 ? <div style={{fontStyle:'italic', color:'#888'}}>No open windows.</div> : (
                                    <div style={{display:'flex', flexDirection:'column', gap:'5px', marginBottom:'10px'}}>
                                        {Object.values(runtimePlan.windows).map(w => (
                                            <div key={w.id} style={{padding:'5px', border:'1px solid #eee', background:'#fafafa', fontSize:'0.9em'}}>
                                                <strong>{w.id}</strong> <span style={{color:'#666'}}>({w.title})</span>
                                                <div style={{fontSize:'0.8em', color:'#888'}}>
                                                    Bounds: {Math.round(w.x)},{Math.round(w.y)} {w.width}x{w.height} | Z:{w.zOrder} | {w.dockMode !== 'none' ? `Docked: ${w.dockMode}` : 'Floating'}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div style={{marginTop:'5px', fontSize:'0.8em', color:'#aaa', cursor:'pointer'}} onClick={(e) => {
                                    // simple toggle for raw details could go here, but for now just show if filtered list is empty or for advanced debug
                                }}>
                                    <span style={{textDecoration:'underline'}}>Raw JSON</span>:
                                    <pre style={{...preStyle, marginTop:'2px'}}>{JSON.stringify(runtimePlan.windows, null, 2)}</pre>
                                </div>
                            </div>
                        )}

                        {/* Overlays Section */}
                        <div style={sectionHeaderStyle} onClick={() => toggleSection('overlays')}>
                            <span>Overlays</span>
                            <span>{runtimeSections.overlays ? '▾' : '▸'}</span>
                        </div>
                        {runtimeSections.overlays && (
                            <div style={{padding:'10px', border:'1px solid #eee', borderTop:'none'}}>
                                {ovCount === 0 ? <div style={{fontStyle:'italic', color:'#888'}}>No open overlays.</div> : (
                                     <div style={{display:'flex', flexDirection:'column', gap:'5px', marginBottom:'10px'}}>
                                        {Object.values(runtimePlan.overlays).map(o => (
                                            <div key={o.id} style={{padding:'5px', border:'1px solid #eee', background: o.isOpen ? '#fff' : '#f9f9f9', fontSize:'0.9em', color: o.isOpen ? '#000' : '#888'}}>
                                                <strong>{o.id}</strong> {o.isOpen ? <span style={{color:'green', fontWeight:'bold'}}>OPEN</span> : <span>(closed)</span>}
                                                <div style={{fontSize:'0.8em', color:'#888'}}>Z:{o.zOrder} Type:{o.blockType || 'n/a'}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <pre style={preStyle}>{JSON.stringify(runtimePlan.overlays, null, 2)}</pre>
                            </div>
                        )}

                        {/* Last Result Section */}
                        <div style={sectionHeaderStyle} onClick={() => toggleSection('lastResult')}>
                            <span>Last Action Result</span>
                            <span>{runtimeSections.lastResult ? '▾' : '▸'}</span>
                        </div>
                        {runtimeSections.lastResult && (
                            <div style={{padding:'10px', border:'1px solid #eee', borderTop:'none'}}>
                                {lastRun ? (
                                    <>
                                        <div style={{fontSize:'0.9em', marginBottom:'5px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                            <span>
                                                <strong>{lastRun.actionId}</strong> at {new Date(lastRun.timestamp).toLocaleTimeString()}
                                                <span style={{ margin: '0 8px', color: '#ccc' }}>|</span>
                                                <span style={{ 
                                                    fontWeight:'bold', 
                                                    padding:'1px 5px', 
                                                    borderRadius:'4px', 
                                                    color:'white', 
                                                    background: getStatusColor(lastStatus),
                                                    fontSize: '0.85em'
                                                }}>
                                                    {lastStatus}
                                                </span>
                                            </span>
                                            <CopyBtn k="lastresult" text={lastRun.result} />
                                        </div>
                                        <pre style={preStyle}>{JSON.stringify(lastRun.result, null, 2)}</pre>
                                    </>
                                ) : (
                                    <div style={{fontStyle:'italic', color:'#888'}}>No actions run yet.</div>
                                )}
                            </div>
                        )}

                        {/* Runtime Plan Section */}
                        <div style={sectionHeaderStyle} onClick={() => toggleSection('plan')}>
                            <span>Full Runtime Plan</span>
                            <span>{runtimeSections.plan ? '▾' : '▸'}</span>
                        </div>
                        {runtimeSections.plan && (
                            <div style={{padding:'10px', border:'1px solid #eee', borderTop:'none'}}>
                                <div style={{display:'flex', justifyContent:'flex-end', marginBottom:'5px'}}>
                                    <CopyBtn k="runtimeplan" text={runtimePlan} />
                                </div>
                                <pre style={preStyle}>{JSON.stringify(runtimePlan, null, 2)}</pre>
                            </div>
                        )}
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

                 const draftBlocksMap = draftBundle.blocks || {};
                 const draftBlocksArr = (Object.values(draftBlocksMap) as any[]).sort((a,b) => (a.blockId||'').localeCompare(b.blockId||''));
                 
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
                         {/* Config Status Banner */}
                         <div style={{
                             padding:'10px', marginBottom:'10px', 
                             borderLeft:'4px solid', 
                             borderColor: runningSource === 'ACTIVE' ? '#2e7d32' : '#f57c00',
                             background: runningSource === 'ACTIVE' ? '#e8f5e9' : '#fff3e0'
                         }}>
                             <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                                 <div>
                                     <div style={{fontWeight:'bold', fontSize:'1em', marginBottom:'4px', color:'#222'}}>Config Status</div>
                                     <div style={{fontSize:'0.9em', color:'#444'}}>
                                         Running: <span style={{fontWeight:'bold', color: runningSource === 'ACTIVE' ? '#2e7d32' : '#f57c00'}}>{runningSource}</span>
                                         {lastConfigEvent && (
                                             <span style={{marginLeft:'10px', color:'#666', fontStyle:'italic'}}>
                                                 ({lastConfigEvent.kind === 'APPLY' ? 'Applied' : 'Rolled back'} at {new Date(lastConfigEvent.ts).toLocaleTimeString()})
                                             </span>
                                         )}
                                     </div>
                                     <div style={{fontSize:'0.85em', color:'#555', marginTop:'4px'}}>
                                         {runningSource === 'DRAFT' 
                                            ? "Runtime is using Draft. Further edits are not live until you Apply again." 
                                            : "Runtime is using Active. Draft changes are not live."}
                                     </div>
                                 </div>
                             </div>
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
                                         <strong>Plan: </strong>
                                         <span>
                                             Add {draftDiff.added.length}, Remove {draftDiff.removed.length}, Modify {draftDiff.modified.length}
                                             {draftDiff.manifestChanged && <span style={{color:'#f57c00', fontWeight:'bold', marginLeft:'5px'}}>+ Manifest Update</span>}
                                         </span>
                                     </div>
                                     
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
                                     <div style={{display:'flex', gap:'5px'}}>
                                        <button 
                                            disabled={!canRollback} 
                                            onClick={() => {
                                                if (window.confirm('Rollback to last ACTIVE bundle? This will reinitialize runtime.')) {
                                                    onRollback();
                                                }
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
                                            disabled={status === 'BLOCKED' || (status === 'WARNINGS' && !ackWarnings)} 
                                            onClick={() => {
                                                if (window.confirm('Apply Draft? This will reinitialize runtime. You can Rollback afterward.')) {
                                                    onApplyDraft(draftBundle as BundleResponse);
                                                }
                                            }}
                                            style={{
                                                background: (status === 'SAFE' || (status === 'WARNINGS' && ackWarnings)) ? '#2e7d32' : '#e0e0e0',
                                                color: 'white',
                                                padding:'6px 14px',
                                                border: (status === 'SAFE' || (status === 'WARNINGS' && ackWarnings)) ? '1px solid #1b5e20' : '1px solid #ccc',
                                                borderRadius:'4px',
                                                cursor: (status === 'SAFE' || (status === 'WARNINGS' && ackWarnings)) ? 'pointer' : 'not-allowed',
                                                fontWeight: 'bold',
                                                opacity: (status === 'BLOCKED' || (status === 'WARNINGS' && !ackWarnings)) ? 0.6 : 1
                                            }}
                                            title="Apply Draft to Runtime"
                                        >
                                            Apply Draft
                                        </button>
                                     </div>
                                     <div style={{fontSize:'0.75em', color:'#666', maxWidth:'250px'}}>
                                         Runtime will re-initialize immediately.
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
                             <button 
                                onClick={handleResetDraft}
                                style={{padding:'4px 10px', fontSize:'0.9em', background:'#d32f2f', color:'white', border:'none', borderRadius:'4px', cursor:'pointer'}}
                             >
                                Discard Draft (clears saved)
                             </button>
                         </div>
                         
                         <div style={{display:'flex', flex:1, width:'100%', overflow:'hidden', gap:'10px', minHeight: 0}}>
                             {/* Left: Block List */}
                             <div style={{flex: '0 0 260px', display:'flex', flexDirection:'column', borderRight:'1px solid #ddd', paddingRight:'5px'}}>
                                 
                                 {/* Regions Editor */}
                                 <div style={{marginBottom:'10px', paddingBottom:'10px', borderBottom:'1px solid #eee'}}>
                                     <div style={{fontWeight:'bold', marginBottom:'5px', color:'#333', fontSize:'0.9em'}}>Regions (Draft)</div>
                                     {['top','main','bottom'].map(slot => {
                                         const regions = (draftBundle as any).manifest?.regions || {};
                                         const current = regions[slot]?.blockId || '';
                                         
                                         return (
                                             <div key={slot} style={{marginBottom:'5px', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                                                 <span style={{fontSize:'0.85em', color:'#555', width:'45px', textTransform:'capitalize'}}>{slot}</span>
                                                 <select 
                                                     value={current} 
                                                     onChange={(e) => handleRegionChange(slot as any, e.target.value)}
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

                                 <input 
                                    type="text" 
                                    placeholder="Filter draft blocks..." 
                                    value={draftBlockFilter} 
                                    onChange={e=>setDraftBlockFilter(e.target.value)} 
                                    style={{width:'100%', marginBottom:'10px', padding:'6px', boxSizing:'border-box', border:'1px solid #ccc'}}
                                 />
                                 <div style={{flex:1, overflowY:'auto'}}>
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
            default: return null;
        }
    };

    return (
        <div style={{
            position: 'absolute', top: '50px', right: '20px', width: '600px', maxWidth: '95vw', maxHeight: '80vh',
            backgroundColor: 'white', color: '#222', 
            border: '2px solid #333', boxShadow: '0 5px 20px rgba(0,0,0,0.3)',
            zIndex: 9000, display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}>
            <div style={{background: '#333', color:'white', padding:'8px 12px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                    <h3 style={{margin:0, fontSize:'1em'}}>Sysadmin (read-only)</h3>
                    <span style={{
                        fontSize:'0.75em', fontWeight:'bold', 
                        padding:'1px 6px', borderRadius:'10px',
                        background: runningSource === 'ACTIVE' ? '#2e7d32' : '#f57c00',
                        color: 'white', border: '1px solid rgba(255,255,255,0.3)'
                    }}>
                        Running: {runningSource}
                    </span>
                </div>
                <button onClick={onClose} style={{background:'transparent', color:'white', border:'none', fontSize:'1.2em', cursor:'pointer'}}>×</button>
            </div>
            
            <div style={{display:'flex', background: '#e5e5e5', color: '#111', borderBottom:'1px solid #ccc', paddingTop:'5px', paddingLeft:'5px'}}>
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
                            }}
                            style={{
                                flex: 1,  
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
  // Configured via vite proxy in dev
  const [baseUrl] = useState('');
  
  const [bundleData, setBundleData] = useState<BundleResponse | null>(null);
  const [pingData, setPingData] = useState<PingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Runtime
  const runtimeRef = useRef<WindowSystemRuntime>(new WindowSystemRuntime());
  const [runtimePlan, setRuntimePlan] = useState<RuntimePlan | null>(null);

  // Sysadmin Toggle
  const [sysadminOpen, setSysadminOpen] = useState(false);
  
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
  const [actionSearch, setActionSearch] = useState('');

  const toggleRunLogs = (id: string) => setExpandedRunIds(prev => ({...prev, [id]: !prev[id]}));

  // Sync state helper
  const syncRuntime = () => {
    setRuntimePlan(runtimeRef.current.getSnapshot());
  };

  // Initialize Runtime when bundle loads
  useEffect(() => {
    if (bundleData && pingData) {
        let width = 800; // Default fallback
        let height = 600;
        if (viewportRef.current) {
            width = viewportRef.current.clientWidth;
            height = viewportRef.current.clientHeight;
        }
        runtimeRef.current.init(bundleData, pingData, width, height);
        syncRuntime();
    }
  }, [bundleData, pingData]);

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
      const bundleRes = await fetch(`${baseUrl}/api/config/shell/bundle`);
      if (!bundleRes.ok) throw new Error(`Bundle fetch failed: ${bundleRes.status} ${bundleRes.statusText}`);
      const rawJson = await bundleRes.json();
      
      const bundleObj = rawJson.bundle?.bundle ?? rawJson.bundle ?? rawJson;
      if (!bundleObj.blocks) bundleObj.blocks = {};
      if (!bundleObj.manifest) bundleObj.manifest = { title: "Unknown Manifest" };

      setBundleData(bundleObj);
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
      else setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const resolvePing = async () => {
    setLoading(true);
    setError(null);
    setPingData(null);
    try {
      const pingRes = await fetch(`${baseUrl}/api/routing/resolve/ping`);
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
    setLoading(true);
    setActionResult(null);
    try {
      const permsArray = override?.permissions ?? actionPerms.split(',').map(s => s.trim()).filter(Boolean);
      const reqBody = {
           sourceBlockId: override?.sourceBlockId ?? sourceBlockId,
           actionName: override?.actionName ?? actionName,
           permissions: permsArray
      };
      
      const res = await fetch(`${baseUrl}/api/debug/action/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody)
      });

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

  const runAction = async (def: ActionDefinition) => {
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

  // UI Handlers wiring to Runtime
  const winOps = {
      focus: (id: string) => { runtimeRef.current.focusWindow(id); syncRuntime(); },
      move: (id: string, x: number, y: number) => { runtimeRef.current.moveWindow(id, x, y); syncRuntime(); },
      resize: (id: string, w: number, h: number) => { runtimeRef.current.resizeWindow(id, w, h); syncRuntime(); },
      close: (id: string) => { runtimeRef.current.closeWindow(id); syncRuntime(); },
      minimize: (id: string, v: boolean) => { runtimeRef.current.setMinimized(id, v); syncRuntime(); },
      dock: (id: string, m: WindowState['dockMode']) => { runtimeRef.current.dockWindow(id, m); syncRuntime(); }
  };

  const overlayOps = {
      open: (id: string) => { runtimeRef.current.setOverlayOpen(id, true); syncRuntime(); },
      close: (id: string) => { runtimeRef.current.setOverlayOpen(id, false); syncRuntime(); },
      dismiss: () => { runtimeRef.current.dismissTop(); syncRuntime(); }
  };

  return (
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

      <div style={{display:'flex', gap:'20px', flex:1, width: '100%', height:'100%', overflow:'hidden'}}>
          
          {/* Left Panel: Logic & Debug */}
          <div style={{width: '300px', overflowY: 'auto', borderRight: '1px solid #ddd', paddingRight:'10px'}}>
             <h4>Debug Controls</h4>
             <div style={{marginBottom:'20px'}}>
                <input type="text" placeholder="Block ID" value={sourceBlockId} onChange={e=>setSourceBlockId(e.target.value)} style={{width:'100%'}}/>
                <input type="text" placeholder="Action (e.g. click)" value={actionName} onChange={e=>setActionName(e.target.value)} style={{width:'100%', marginTop:'5px'}}/>
                <input type="text" placeholder="Permissions" value={actionPerms} onChange={e=>setActionPerms(e.target.value)} style={{width:'100%', marginTop:'5px'}}/>
                <button onClick={() => { void handleDispatch(); }} style={{marginTop:'5px', width:'100%'}}>Dispatch Action</button>
                <button onClick={() => setSysadminOpen(!sysadminOpen)} style={{marginTop:'10px', width:'100%', background: sysadminOpen ? '#333' : '#eee', color: sysadminOpen ? 'white' : 'black'}}>
                    {sysadminOpen ? 'Close Sysadmin' : 'Open Sysadmin'}
                </button>
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
                {actionResult && <pre style={{
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
                 {runtimePlan && Object.values(runtimePlan.windows).map(w => (
                     <li key={w.id} style={{fontSize:'0.9em'}}>
                         <span style={{fontWeight: w.zOrder > 100 ? 'bold' : 'normal'}}>{w.id}</span>
                         <button onClick={() => winOps.focus(w.id)} style={{marginLeft:'5px', fontSize:'0.7em'}}>Focus</button>
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

          {/* Right Panel: The Viewport */}
          <div ref={viewportRef} style={{flex:1, position:'relative', backgroundColor:'#f0f0f0', overflow:'auto', minWidth: 0, minHeight: 0, border:'2px solid #333', borderRadius:'4px', boxShadow:'inset 0 0 10px rgba(0,0,0,0.1)'}}>
             {/* The "Desktop" */}
             {runtimePlan ? (
                 <>
                    {/* Windows */}
                    {Object.values(runtimePlan.windows).map(w => (
                        <WindowFrame 
                           key={w.id} 
                           win={w}
                           onFocus={() => winOps.focus(w.id)}
                           onMove={(x,y) => winOps.move(w.id, x, y)}
                           onResize={(width,height) => winOps.resize(w.id, width, height)}
                           onClose={() => winOps.close(w.id)}
                           onMinimize={(v) => winOps.minimize(w.id, v)}
                           onDock={(m) => winOps.dock(w.id, m)}
                        />
                    ))}

                    {/* Overlays */}
                    <OverlayLayer 
                        overlays={Object.values(runtimePlan.overlays)} 
                        onClose={overlayOps.close}
                        onDismissCtx={overlayOps.dismiss}
                        actions={runtimePlan.actions}
                        onRunAction={runAction}
                        lastRun={actionRuns[0]}
                        recentRuns={actionRuns}
                        expandedRunIds={expandedRunIds}
                        onToggleRunLogs={toggleRunLogs}
                        actionSearch={actionSearch}
                        onChangeActionSearch={setActionSearch}
                    />
                 </>
             ) : (
                <div style={{padding: '20px', color: '#999', textAlign:'center', marginTop:'100px'}}>
                   Load Bundle & Resolve Ping to Start Runtime
                </div>
             )}
            
             <SysadminPanel 
                 isOpen={sysadminOpen} 
                 onClose={() => setSysadminOpen(false)}
                 bundleData={bundleData}
                 runtimePlan={runtimePlan}
                 actionRuns={actionRuns}
                 runningSource={runningSource}
                 lastConfigEvent={lastConfigEvent}
                 onApplyDraft={applyDraft}
                 onRollback={rollbackActive}
                 canRollback={!!lastActiveBundle && runningSource === 'DRAFT'}
             />
          </div>
      </div>
    </div>
  );
}

export default App;
