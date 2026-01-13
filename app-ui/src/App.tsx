import { useState } from 'react';
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

function App() {
  const [baseUrl, setBaseUrl] = useState('http://127.0.0.1:3000');
  const [devMode, setDevMode] = useState(false);
  const [bundleData, setBundleData] = useState<BundleResponse | null>(null);
  const [pingData, setPingData] = useState<PingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debug Action State
  const [sourceBlockId, setSourceBlockId] = useState('');
  const [actionName, setActionName] = useState('');
  const [actionPerms, setActionPerms] = useState('can_click');
  const [actionResult, setActionResult] = useState<any>(null);

  const handleLoadPlan = async () => {
    setLoading(true);
    setError(null);
    setBundleData(null);
    setPingData(null);

    try {
      // 1. Fetch Bundle
      const bundleRes = await fetch(`${baseUrl}/api/config/shell/bundle`);
      if (!bundleRes.ok) throw new Error(`Bundle fetch failed: ${bundleRes.status} ${bundleRes.statusText}`);
      const bundleJson = await bundleRes.json();
      setBundleData(bundleJson);

      // 2. Fetch Resolve Ping
      const pingRes = await fetch(`${baseUrl}/api/routing/resolve/ping`);
      // Note: Endpoint might return 401/403 which is valid data in this context, but here we expect JSON
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
      const data = await res.json();
      setActionResult(data);
    } catch (err: any) {
      setActionResult({ error: err.message });
    } finally {
      setLoading(false);
    }
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
        <button onClick={handleLoadPlan} disabled={loading} style={{ marginTop: '10px' }}>
          {loading ? 'Loading...' : 'Load Plan'}
        </button>
        {error && <div style={{ color: 'red', marginTop: '10px' }}>Error: {error}</div>}
      </div>

      {bundleData && pingData && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div style={{ border: '1px solid #eee', padding: '10px' }}>
            <h3>Routing Info (Ping)</h3>
            <div><strong>Allowed:</strong> {pingData.allowed ? 'YES' : 'NO'}</div>
            <div><strong>Status:</strong> {pingData.status}</div>
            <div><strong>Target Block:</strong> {pingData.targetBlockId || 'N/A'}</div>
            
            <h3 style={{ marginTop: '20px' }}>Bundle Stats</h3>
            <div><strong>Blocks:</strong> {Object.keys(bundleData.blocks).length}</div>
            <div><strong>Manifest Title:</strong> {bundleData.manifest?.title}</div>
          </div>
          
          <div style={{ border: '1px solid #eee', padding: '10px', maxHeight: '400px', overflow: 'auto' }}>
            <h3>Raw Plan Data</h3>
            <pre style={{ fontSize: '12px' }}>{JSON.stringify({ ping: pingData, bundleManifest: bundleData.manifest }, null, 2)}</pre>
          </div>
        </div>
      )}

      {devMode && (
        <div style={{ marginTop: '20px', border: '2px solid orange', padding: '10px' }}>
          <h3>🛠 Debug Actions</h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input placeholder="Source Block ID" value={sourceBlockId} onChange={e => setSourceBlockId(e.target.value)} />
            <input placeholder="Action Name" value={actionName} onChange={e => setActionName(e.target.value)} />
            <input placeholder="Permissions (comma sep)" value={actionPerms} onChange={e => setActionPerms(e.target.value)} />
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
