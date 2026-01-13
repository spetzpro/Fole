import { useState, useEffect, useRef } from 'react';
import './App.css';

interface PingResponse {
  allowed: boolean;
  status: number;
  targetBlockId?: string;
}

interface BundleResponse {
  manifest: any;
  blocks: Record<string, any>;
}

// --- Minimal In-Browser Runtime Models ---

interface OverlayState {
  id: string;
  isOpen: boolean;
  zOrder: number;
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

  public init(bundle: BundleResponse, ping: PingResponse) {
    this.entrySlug = 'ping';
    this.targetBlockId = ping.targetBlockId || 'unknown';
    this.windows.clear();
    this.overlays.clear();
    this.actions = [];
    this.zCounter = 100;

    const blocks = bundle.blocks || {};

    // 1. Scan for Windows & Overlays
    Object.values(blocks).forEach((block: any) => {
      const blockType = typeof block.blockType === 'string' ? block.blockType : '';
      const blockId = typeof block.id === 'string' ? block.id : '';
      const title = block.title || block.name || blockId;

      if (!blockId) return;

      if (blockType.includes('overlay')) {
        this.overlays.set(blockId, {
          id: blockId,
          isOpen: false,
          zOrder: 2000 // Overlays sit above windows
        });
      } else if (blockType.includes('window') || blockId.includes('win') || blockType.includes('panel')) {
         // Default Window Layout
         this.windows.set(blockId, {
            id: blockId,
            title,
            x: 50 + (this.windows.size * 30),
            y: 50 + (this.windows.size * 30),
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
    Object.values(blocks).forEach((block: any) => {
       const blockType = typeof block.blockType === 'string' ? block.blockType : '';
       const blockId = typeof block.id === 'string' ? block.id : '';
       if (!blockId) return;

       if (Array.isArray(block.actions)) {
          block.actions.forEach((act: string) => {
             actionIdx.push({ id: `${blockId}:${act}`, actionName: act, sourceBlockId: blockId });
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
    onDock: (mode: any) => void
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

function OverlayLayer({ overlays, onClose, onDismissCtx }: { 
    overlays: OverlayState[], 
    onClose: (id: string) => void,
    onDismissCtx: () => void
}) {
    const activeOverlays = overlays.filter(o => o.isOpen).sort((a,b) => a.zOrder - b.zOrder);
    if (activeOverlays.length === 0) return null;

    return (
        <div style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            zIndex: 2000,
            pointerEvents: 'none' // Allow pass through if backdrop issues? No, backdrop handles blocking
        }}>
            {/* Backdrop for the top-most overlay context */}
            <div 
                onClick={onDismissCtx}
                style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    backgroundColor: 'rgba(0,0,0,0.4)',
                    pointerEvents: 'auto'
                }}
            />
            {activeOverlays.map(o => (
                <div key={o.id} style={{
                    position: 'absolute',
                    top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    width: '400px', height: '300px',
                    backgroundColor: 'white',
                    border: '1px solid #777',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                    pointerEvents: 'auto',
                    padding: '20px',
                    display: 'flex', flexDirection: 'column'
                }}>
                     <h3>Overlay: {o.id}</h3>
                     <div style={{flex:1}}>
                        Content...
                     </div>
                     <button onClick={() => onClose(o.id)}>Close Modal</button>
                </div>
            ))}
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

  // Debug Action State
  const [sourceBlockId, setSourceBlockId] = useState('');
  const [actionName, setActionName] = useState('');
  const [actionPerms, setActionPerms] = useState('can_click');
  const [actionResult, setActionResult] = useState<any>(null);

  // Sync state helper
  const syncRuntime = () => {
    setRuntimePlan(runtimeRef.current.getSnapshot());
  };

  // Initialize Runtime when bundle loads
  useEffect(() => {
    if (bundleData && pingData) {
        runtimeRef.current.init(bundleData, pingData);
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
    } catch (err: any) {
      setError(err.message);
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
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDispatch = async () => {
    setLoading(true);
    setActionResult(null);
    try {
      const permsArray = actionPerms.split(',').map(s => s.trim()).filter(Boolean);
      const res = await fetch(`${baseUrl}/api/debug/action/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
           sourceBlockId,
           actionName,
           permissions: permsArray
        })
      });

      if (res.status === 403) {
        setActionResult({ error: "Access Denied (403)", message: "Use FOLE_DEV_ENABLE_DEBUG_ENDPOINTS=1 env var" });
        return;
      }
      const data = await res.json();
      setActionResult(data);
    } catch (err: any) {
      setActionResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  // UI Handlers wiring to Runtime
  const winOps = {
      focus: (id: string) => { runtimeRef.current.focusWindow(id); syncRuntime(); },
      move: (id: string, x: number, y: number) => { runtimeRef.current.moveWindow(id, x, y); syncRuntime(); },
      resize: (id: string, w: number, h: number) => { runtimeRef.current.resizeWindow(id, w, h); syncRuntime(); },
      close: (id: string) => { runtimeRef.current.closeWindow(id); syncRuntime(); },
      minimize: (id: string, v: boolean) => { runtimeRef.current.setMinimized(id, v); syncRuntime(); },
      dock: (id: string, m: any) => { runtimeRef.current.dockWindow(id, m); syncRuntime(); }
  };

  const overlayOps = {
      open: (id: string) => { runtimeRef.current.setOverlayOpen(id, true); syncRuntime(); },
      close: (id: string) => { runtimeRef.current.setOverlayOpen(id, false); syncRuntime(); },
      dismiss: () => { runtimeRef.current.dismissTop(); syncRuntime(); }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column', height: '100vh', boxSizing:'border-box' }}>
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

      <div style={{display:'flex', gap:'20px', flex:1, overflow:'hidden'}}>
          
          {/* Left Panel: Logic & Debug */}
          <div style={{width: '300px', overflowY: 'auto', borderRight: '1px solid #ddd', paddingRight:'10px'}}>
             <h4>Debug Controls</h4>
             <div style={{marginBottom:'20px'}}>
                <input type="text" placeholder="Block ID" value={sourceBlockId} onChange={e=>setSourceBlockId(e.target.value)} style={{width:'100%'}}/>
                <input type="text" placeholder="Action (e.g. click)" value={actionName} onChange={e=>setActionName(e.target.value)} style={{width:'100%', marginTop:'5px'}}/>
                <input type="text" placeholder="Permissions" value={actionPerms} onChange={e=>setActionPerms(e.target.value)} style={{width:'100%', marginTop:'5px'}}/>
                <button onClick={handleDispatch} style={{marginTop:'5px', width:'100%'}}>Dispatch Action</button>
                {actionResult && <pre style={{fontSize:'10px', background:'#eee', padding:'5px'}}>{JSON.stringify(actionResult, null, 2)}</pre>}
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
          </div>

          {/* Right Panel: The Viewport */}
          <div style={{flex:1, position:'relative', backgroundColor:'#f0f0f0', overflow:'hidden', border:'2px solid #333', borderRadius:'4px', boxShadow:'inset 0 0 10px rgba(0,0,0,0.1)'}}>
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
                    />
                 </>
             ) : (
                <div style={{padding: '20px', color: '#999', textAlign:'center', marginTop:'100px'}}>
                   Load Bundle & Resolve Ping to Start Runtime
                </div>
             )}
          </div>
      </div>
    </div>
  );
}

export default App;
