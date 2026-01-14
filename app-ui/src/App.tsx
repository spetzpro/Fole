import { useState, useEffect, useRef } from 'react';
import './App.css';

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
                const filteredActions = isMenu && q 
                    ? actions.filter(a => 
                        a.id.toLowerCase().includes(q) || 
                        a.actionName.toLowerCase().includes(q) || 
                        a.sourceBlockId.toLowerCase().includes(q)
                      ) 
                    : actions;

                // Group actions by sourceBlockId
                const groups = new Map<string, ActionDefinition[]>();
                if (isMenu) {
                    filteredActions.forEach(act => {
                        const k = act.sourceBlockId;
                        if (!groups.has(k)) groups.set(k, []);
                        groups.get(k)!.push(act);
                    });
                }
                const sortedGroupKeys = Array.from(groups.keys()).sort();

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
                             <h3 style={{margin:0}}>
                                {isMenu ? 'Available Actions' : `Overlay: ${o.id}`}
                             </h3>
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
                                                {groups.get(groupKey)!.sort((a,b) => a.actionName.localeCompare(b.actionName)).map(act => (
                                                    <button 
                                                        key={act.id} 
                                                        onClick={() => onRunAction(act)}
                                                        style={{padding:'8px', textAlign:'left', border:'1px solid #ccc', cursor:'pointer'}}
                                                    >
                                                        <strong>{act.actionName}</strong> 
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}

                                    {filteredActions.length === 0 && <p style={{color:'#999'}}>No actions match your search.</p>}

                                    {/* Inline Feedback in Menu */}
                                    {lastRun ? (
                                      <div style={{ marginTop: '10px', padding: '5px', background: '#eee', fontSize: '0.8em', borderLeft: '3px solid #666' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                          <strong>Last Result:</strong>
                                          <span>{lastRun.actionId}</span>
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

function SysadminPanel({ isOpen, onClose, bundleData, runtimePlan, actionRuns = [] }: { 
    isOpen: boolean; 
    onClose: () => void; 
    bundleData: BundleResponse | null; 
    runtimePlan: RuntimePlan | null; 
    actionRuns: ActionRunRecord[];
}) {
    // Tabs: ShellConfig, Blocks, Bindings, ActionIndex, Runtime
    const [activeTab, setActiveTab] = useState('ShellConfig');
    const [filter, setFilter] = useState('');

    if (!isOpen) return null;

    const tabs = ['ShellConfig', 'Blocks', 'Bindings', 'ActionIndex', 'Runtime'];

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
                return <pre style={preStyle}>{JSON.stringify(bundleData, null, 2)}</pre>;
            }
            case 'Blocks': {
                 if (!bundleData || !bundleData.blocks) return <div>No blocks data found.</div>;
                 const blocks = Array.isArray(bundleData.blocks) ? bundleData.blocks : Object.values(bundleData.blocks);
                 const f = filter.toLowerCase();
                 const filtered = blocks.filter((b: any) => 
                    !f || (b.id && b.id.toLowerCase().includes(f)) || (b.blockType && b.blockType.toLowerCase().includes(f))
                 );
                 return (
                     <div>
                         <input type="text" placeholder="Filter blocks..." value={filter} onChange={e=>setFilter(e.target.value)} style={{width:'100%', marginBottom:'10px'}}/>
                         <div style={{display:'flex', flexDirection:'column', gap:'5px'}}>
                             {filtered.map((b: any, i: number) => (
                                 <div key={b.id || i} style={{border:'1px solid #ddd', padding:'5px', fontSize:'0.9em'}}>
                                     <strong>{b.id}</strong> <span style={{color:'#666'}}>({b.blockType || 'unknown'})</span>
                                 </div>
                             ))}
                             {filtered.length === 0 && <div style={{fontStyle:'italic'}}>No matching blocks.</div>}
                         </div>
                     </div>
                 );
            }
             case 'Bindings': {
                 const bindings = (bundleData as any)?.bindings || (bundleData as any)?.bundle?.bindings;
                 if (!bindings || Object.keys(bindings).length === 0) return <div>No bindings found in config.</div>;
                 return <pre style={preStyle}>{JSON.stringify(bindings, null, 2)}</pre>;
            }
            case 'ActionIndex': {
                const actions = runtimePlan?.actions || [];
                const f = filter.toLowerCase();
                const filtered = actions.filter(a => !f || a.actionName.toLowerCase().includes(f) || a.sourceBlockId.toLowerCase().includes(f));
                
                // Group by source
                const groups = new Map<string, ActionDefinition[]>();
                filtered.forEach(a => {
                    if (!groups.has(a.sourceBlockId)) groups.set(a.sourceBlockId, []);
                    groups.get(a.sourceBlockId)!.push(a);
                });
                const sortedKeys = Array.from(groups.keys()).sort();

                return (
                    <div>
                         <input type="text" placeholder="Filter actions..." value={filter} onChange={e=>setFilter(e.target.value)} style={{width:'100%', marginBottom:'10px'}}/>
                         {sortedKeys.map(k => (
                             <div key={k} style={{marginBottom:'10px'}}>
                                 <div style={{fontWeight:'bold', borderBottom:'1px solid #eee'}}>{k} <span style={{fontWeight:'normal', fontSize:'0.8em', color:'#888'}}>({groups.get(k)?.length})</span></div>
                                 <div style={{paddingLeft:'10px'}}>
                                     {groups.get(k)?.map(a => (
                                         <div key={a.id} style={{fontSize:'0.9em', padding:'2px 0'}}>{a.actionName}</div>
                                     ))}
                                 </div>
                             </div>
                         ))}
                    </div>
                );
            }
            case 'Runtime': {
                if (!runtimePlan) return <div>Runtime not initialized.</div>;
                const summary = {
                    windows: Object.keys(runtimePlan.windows).length,
                    overlays: Object.keys(runtimePlan.overlays).length,
                    actions: runtimePlan.actions.length,
                    actionRuns: actionRuns.length
                };
                return (
                    <div>
                        <div style={{marginBottom:'10px', padding:'5px', background:'#eef'}}>
                            <strong>Overview:</strong> {JSON.stringify(summary)}
                        </div>
                        <h4>Full Snapshot</h4>
                        <pre style={preStyle}>{JSON.stringify(runtimePlan, null, 2)}</pre>
                    </div>
                );
            }
            default: return null;
        }
    };

    return (
        <div style={{
            position: 'absolute', top: '50px', right: '20px', width: '520px', maxHeight: '80vh',
            backgroundColor: 'white', color: '#222', 
            border: '2px solid #333', boxShadow: '0 5px 20px rgba(0,0,0,0.3)',
            zIndex: 9000, display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}>
            <div style={{background: '#333', color:'white', padding:'8px 12px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <h3 style={{margin:0, fontSize:'1em'}}>Sysadmin (read-only)</h3>
                <button onClick={onClose} style={{background:'transparent', color:'white', border:'none', fontSize:'1.2em', cursor:'pointer'}}>×</button>
            </div>
            
            <div style={{display:'flex', background: '#e5e5e5', color: '#111', borderBottom:'1px solid #ccc', paddingTop:'5px', paddingLeft:'5px'}}>
                {tabs.map(t => {
                    const isActive = activeTab === t;
                    return (
                        <button 
                            key={t} 
                            onClick={() => { setActiveTab(t); setFilter(''); }}
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

            <div style={{flex:1, overflowY:'auto', padding:'10px'}}>
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
                <button onClick={handleDispatch} style={{marginTop:'5px', width:'100%'}}>Dispatch Action</button>
                <button onClick={() => setSysadminOpen(!sysadminOpen)} style={{marginTop:'10px', width:'100%', background: sysadminOpen ? '#333' : '#eee', color: sysadminOpen ? 'white' : 'black'}}>
                    {sysadminOpen ? 'Close Sysadmin' : 'Open Sysadmin'}
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

             <h4>Action History</h4>
             <ul style={{ paddingLeft: '0', listStyle: 'none' }}>
                {actionRuns.map(run => (
                    <li key={run.id} style={{ marginBottom: '10px', borderBottom: '1px solid #eee', paddingBottom: '5px' }}>
                        <div style={{ fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                           <span>{run.actionId}</span>
                           <span style={{ fontWeight: 'normal', color: '#999' }}>{new Date(run.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div style={{ color: run.result.error ? 'red' : 'green', margin: '2px 0' }}>
                            {run.result.error ? 'ERROR' : 'OK'}
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
                ))}
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
             />
          </div>
      </div>
    </div>
  );
}

export default App;
