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

  const fetchBundle = async () => {
    setLoading(true);
    setError(null);
    setBundleData(null);
    try {
      const bundleRes = await fetch(`${baseUrl}/api/config/shell/bundle`);
      if (!bundleRes.ok) throw new Error(`Bundle fetch failed: ${bundleRes.status} ${bundleRes.statusText}`);
      const bundleJson = await bundleRes.json();
      setBundleData(bundleJson);
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
        <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
            <button onClick={fetchBundle} disabled={loading}>Fetch Bundle</button>
            <button onClick={resolvePing} disabled={loading}>Resolve Ping</button>
        </div>
        
        {error && <div style={{ color: 'red', marginTop: '10px' }}>Error: {error}</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Bundle Info Column */}
          <div style={{ border: '1px solid #eee', padding: '10px' }}>
            <h3>Bundle Info</h3>
            {bundleData ? (
                <>
                    <div><strong>Blocks:</strong> {Object.keys(bundleData.blocks).length}</div>
                    <div><strong>Manifest Title:</strong> {bundleData.manifest?.title}</div>
                    <details style={{ marginTop: '10px' }}>
                        <summary>Raw JSON</summary>
                        <pre style={{ fontSize: '12px', background: '#f9f9f9', overflow: 'auto' }}>
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
                    <details style={{ marginTop: '10px' }}>
                        <summary>Raw JSON</summary>
                        <pre style={{ fontSize: '12px', background: '#f9f9f9', overflow: 'auto' }}>
                            {JSON.stringify(pingData, null, 2)}
                        </pre>
                    </details>
                </>
            ) : ( <div>No ping data</div> )}
          </div>
      </div>

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
