import { useState, useEffect } from 'react';
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

// Factory Simulation
function createOverlayRuntime(params: { overlays: any[] }) {
  // Initialize state for overlays found in bundle
  const state: Record<string, OverlayState> = {};
  params.overlays.forEach((block: any, idx: number) => {
    state[block.id] = {
      id: block.id,
      isOpen: false, // default closed
      zOrder: 100 + idx
    };
  });
  return state;
}

function createWindowSystemRuntime(params: { 
  tabId: string; 
  viewport: { width: number, height: number }; 
  registry: any;
}) {
  const state: Record<string, WindowState> = {};
  // Scan registry (bundle blocks) for windows
  Object.values(params.registry).forEach((block: any) => {
    const blockType = typeof block.blockType === 'string' ? block.blockType : '';
    const blockId = typeof block.id === 'string' ? block.id : '';

    // Heuristic: if block type has 'window' or is implicitly a window
    if (blockType.includes('window') || blockId.includes('win')) {
      state[blockId] = {
        id: blockId,
        x: 100,
        y: 100,
        width: 400,
        height: 300,
        isMinimized: false,
        dockMode: 'none',
        zOrder: 1
      };
    }
  });
  return state;
}

function buildActionIndex(bundle: BundleResponse) {
  const actions: ActionDefinition[] = [];
  const blocks = bundle.blocks || {};
  Object.values(blocks).forEach((block: any) => {
    const blockType = typeof block.blockType === 'string' ? block.blockType : '';
    const blockId = typeof block.id === 'string' ? block.id : '';
    
    // Heuristic: Generate actions for buttons or clickable things
    if (Array.isArray(block.actions)) {
       block.actions.forEach((act: string) => {
         actions.push({ id: `${blockId}:${act}`, actionName: act, sourceBlockId: blockId });
       });
    } else if (blockType.includes('button')) {
       // Implicit 'click' for buttons
       actions.push({ id: `${blockId}:click`, actionName: 'click', sourceBlockId: blockId });
       actions.push({ id: `${blockId}:context`, actionName: 'context', sourceBlockId: blockId });
    }
  });
  return actions;
}


function App() {
  // Configured via vite proxy in dev
  const [baseUrl, setBaseUrl] = useState('');
  const [devMode, setDevMode] = useState(false);
  const [bundleData, setBundleData] = useState<BundleResponse | null>(null);
  const [pingData, setPingData] = useState<PingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Runtime State
  const [runtimePlan, setRuntimePlan] = useState<RuntimePlan | null>(null);

  // Debug Action State
  const [sourceBlockId, setSourceBlockId] = useState('');
  const [actionName, setActionName] = useState('');
  const [actionPerms, setActionPerms] = useState('can_click');
  const [actionResult, setActionResult] = useState<any>(null);

  // Initialize Runtime when bundle loads
  useEffect(() => {
    if (bundleData && pingData) {
        const blocks = bundleData.blocks || {};
        // A) Overlays
        const overlaysList = Object.values(blocks).filter((b: any) => b.blockType?.includes('overlay'));
        const overlayState = createOverlayRuntime({ overlays: overlaysList });

        // B) Windows
        const windowState = createWindowSystemRuntime({
            tabId: 'ui_tab',
            viewport: { width: 800, height: 600 },
            registry: blocks
        });

        // C) Actions
        const actionIdx = buildActionIndex(bundleData);

        setRuntimePlan({
            entrySlug: 'ping', // derived from pingData really
            targetBlockId: pingData.targetBlockId || 'unknown',
            windows: windowState,
            overlays: overlayState,
            actions: actionIdx
        });
    }
  }, [bundleData, pingData]);

  const fetchBundle = async () => {
    setLoading(true);
    setError(null);
    setBundleData(null);
    try {
      const bundleRes = await fetch(`${baseUrl}/api/config/shell/bundle`);
      if (!bundleRes.ok) throw new Error(`Bundle fetch failed: ${bundleRes.status} ${bundleRes.statusText}`);
      const rawJson = await bundleRes.json();
      
      // Normalize: bundle endpoint might return { bundle: { ... } } or just { manifest, blocks }
      const bundleObj = rawJson.bundle?.bundle ?? rawJson.bundle ?? rawJson;
      // Ensure blocks is at least an empty object
      if (!bundleObj.blocks) {
        bundleObj.blocks = {};
      }
      // Ensure manifest exists
      if (!bundleObj.manifest) {
        bundleObj.manifest = { title: "Unknown Manifest" };
      }

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
        setActionResult({ 
            error: "Access Denied (403)", 
            message: "Enable debug endpoints on server (FOLE_DEV_ENABLE_DEBUG_ENDPOINTS=1 etc.)" 
        });
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

  // --- Runtime Interactions ---

  const toggleOverlay = () => {
     if (!runtimePlan) return;
     const keys = Object.keys(runtimePlan.overlays);
     if (keys.length === 0) return;
     const key = keys[0]; // Just toggle first one
     setRuntimePlan(prev => {
         if (!prev) return null;
         return {
             ...prev,
             overlays: {
                 ...prev.overlays,
                 [key]: { ...prev.overlays[key], isOpen: !prev.overlays[key].isOpen }
             }
         };
     });
  };

  const updateFirstWindow = (updater: (w: WindowState) => Partial<WindowState>) => {
      if (!runtimePlan) return;
      const keys = Object.keys(runtimePlan.windows);
      if (keys.length === 0) return;
      const key = keys[0];
      setRuntimePlan(prev => {
          if (!prev) return null;
          const w = prev.windows[key];
          return {
              ...prev,
              windows: {
                  ...prev.windows,
                  [key]: { ...w, ...updater(w) }
              }
          };
      });
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>ShellRuntime Bootstrap UI</h1>
      
      <div style={{ marginBottom: '20px', border: '1px solid #ccc', padding: '10px' }}>
        <h3>Connection Settings</h3>
        <label>
          Base URL: 
          <input 
            type="text" 
            value={baseUrl} 
            onChange={e => setBaseUrl(e.target.value)} 
            placeholder="(relative)"
            style={{ width: '300px', marginLeft: '10px' }}
          />
        </label>
        <br />
        <label>
          <input 
            type="checkbox" 
            checked={devMode} 
            onChange={e => setDevMode(e.target.checked)} 
          />
          Dev Mode (Enable Debug Actions)
        </label>
        <br />
        <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
            <button onClick={fetchBundle} disabled={loading}>Fetch Bundle</button>
            <button onClick={resolvePing} disabled={loading}>Resolve Ping</button>
        </div>
        
        {error && <div style={{ color: 'red', marginTop: '10px' }}>Error: {error}</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '20px' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Bundle Info Column */}
            <div style={{ border: '1px solid #eee', padding: '10px' }}>
                <h3>Bundle Info</h3>
                {bundleData ? (
                    <>
                        <div><strong>Blocks:</strong> {Object.keys(bundleData.blocks).length}</div>
                        <div><strong>Manifest Title:</strong> {bundleData.manifest?.title}</div>
                        <details style={{ marginTop: '10px' }}>
                            <summary>Raw JSON</summary>
                            <pre style={{ fontSize: '10px', background: '#f9f9f9', overflow: 'auto', maxHeight: '200px' }}>
                                {JSON.stringify(bundleData, null, 2)}
                            </pre>
                        </details>
                    </>
                ) : ( <div>No bundle loaded</div> )}
            </div>

            {/* Ping Info Column */}
            <div style={{ border: '1px solid #eee', padding: '10px' }}>
                <h3>Ping Resolve</h3>
                {pingData ? (
                    <>
                        <div><strong>Allowed:</strong> {pingData.allowed ? 'YES' : 'NO'}</div>
                        <div><strong>Status:</strong> {pingData.status}</div>
                        <div><strong>Target Block:</strong> {pingData.targetBlockId || 'N/A'}</div>
                    </>
                ) : ( <div>No ping data</div> )}
            </div>
          </div>

          {/* Runtime Panel */}
          <div style={{ border: '2px solid #2196F3', padding: '10px', background: '#E3F2FD' }}>
              <h3>🖥 Runtime Panel (Local Sim)</h3>
              {runtimePlan ? (
                  <div>
                      <div style={{ display: 'flex', gap: '5px', marginBottom: '10px', flexWrap: 'wrap' }}>
                          <button onClick={toggleOverlay}>Toggle Overlay (First)</button>
                          <button onClick={() => updateFirstWindow(w => ({ isMinimized: false, zOrder: w.zOrder + 1 }))}>Open Window</button>
                          <button onClick={() => updateFirstWindow(w => ({ zOrder: w.zOrder + 10 }))}>Focus Window</button>
                          <button onClick={() => updateFirstWindow(() => ({ isMinimized: true }))}>Minimize Window</button>
                          <button onClick={() => updateFirstWindow(w => ({ dockMode: w.dockMode === 'left' ? 'none' : 'left' }))}>Dock Left</button>
                          <button onClick={() => updateFirstWindow(w => ({ dockMode: w.dockMode === 'right' ? 'none' : 'right' }))}>Dock Right</button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div>
                              <h4>🪟 Windows ({Object.keys(runtimePlan.windows).length})</h4>
                              <pre style={{ fontSize: '11px', background: 'white', padding: '5px', borderRadius: '4px' }}>
                                  {JSON.stringify(runtimePlan.windows, null, 2)}
                              </pre>
                          </div>
                          <div>
                              <h4>🥞 Overlays ({Object.keys(runtimePlan.overlays).length})</h4>
                              <pre style={{ fontSize: '11px', background: 'white', padding: '5px', borderRadius: '4px' }}>
                                  {JSON.stringify(runtimePlan.overlays, null, 2)}
                              </pre>
                          </div>
                      </div>

                      <div style={{ marginTop: '10px', borderTop: '1px solid #ccc', paddingTop: '10px' }}>
                          <h4>⚡ Available Actions ({runtimePlan.actions.length})</h4>
                          <select 
                            style={{ padding: '5px', width: '100%' }} 
                            onChange={(e) => {
                                if (!e.target.value) return;
                                const act = runtimePlan.actions.find(a => a.id === e.target.value);
                                if (act) {
                                    setSourceBlockId(act.sourceBlockId);
                                    setActionName(act.actionName);
                                }
                            }}
                          >
                            <option value="">Select an action to prep debug...</option>
                            {runtimePlan.actions.map(a => (
                                <option key={a.id} value={a.id}>{a.actionName} (on {a.sourceBlockId})</option>
                            ))}
                          </select>
                      </div>
                  </div>
              ) : (
                  <div>Load Bundle + Ping to initialize Runtime</div>
              )}
          </div>
      
      </div>

      {devMode && (
        <div style={{ marginTop: '20px', border: '2px solid orange', padding: '10px' }}>
          <h3>🛠 Debug Actions</h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input placeholder="Source Block ID" value={sourceBlockId} onChange={e => setSourceBlockId(e.target.value)} />
            <input placeholder="Action Name" value={actionName} onChange={e => setActionName(e.target.value)} />
            <input placeholder="Permissions" value={actionPerms} onChange={e => setActionPerms(e.target.value)} />
            <button onClick={handleDispatch} disabled={loading}>Dispatch</button>
          </div>
          {actionResult && (
             <div style={{ marginTop: '10px', background: '#f0f0f0', padding: '5px' }}>
               <strong>Result:</strong>
               <pre>{JSON.stringify(actionResult, null, 2)}</pre>
             </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;

