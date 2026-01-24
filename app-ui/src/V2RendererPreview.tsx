import { useEffect, useState } from 'react';

// Minimal types matching backend ResolvedUiGraph
interface ResolvedUiNode {
    id: string;
    kind: string;
    props: Record<string, unknown>;
    children?: string[]; // Child IDs
}

interface ResolvedUiGraph {
    nodesById: Record<string, ResolvedUiNode>;
    slotsById?: Record<string, unknown>;
    rootNodeId: string;
}

interface V2RendererPreviewProps {
    onClose: () => void;
}

export function V2RendererPreview({ onClose }: V2RendererPreviewProps) {
    const [graph, setGraph] = useState<ResolvedUiGraph | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchGraph = async () => {
            try {
                // Single step: Get active resolved graph
                const graphRes = await fetch('/api/config/shell/resolved-graph/active');
                
                if (graphRes.status === 404) {
                     const errData = await graphRes.json().catch(() => ({}));
                     if (errData.code === "resolved_graph_not_found") {
                         throw new Error("No active V2 graph found. Activate a config containing ui.node.* blocks.");
                     }
                     throw new Error('Graph not found (404)');
                }
                
                if (!graphRes.ok) throw new Error('Failed to fetch resolved graph');
                
                const graphData = await graphRes.json();
                setGraph(graphData);
            } catch (err: any) {
                setError(err.message);
            }
        };
        fetchGraph();
    }, []);

    const renderNode = (nodeId: string) => {
        if (!graph || !graph.nodesById[nodeId]) return <div key={nodeId} style={{color:'red'}}>Missing Node: {nodeId}</div>;
        const node = graph.nodesById[nodeId];

        const style: React.CSSProperties = {
            padding: '10px',
            margin: '5px'
        };

        const commonKey = node.id;

        switch (node.kind) {
            case 'ui.node.container':
                return (
                    <div key={commonKey} style={{...style, border: '1px dashed #666', backgroundColor: '#f9f9f9'}}>
                        <small style={{color:'#666', display:'block', marginBottom:'5px'}}>Container ({node.id})</small>
                        {node.children?.map(childId => renderNode(childId))}
                    </div>
                );
            case 'ui.node.text':
                return (
                    <div key={commonKey} style={{...style, backgroundColor: 'white'}}>
                        {String(node.props.content || '')}
                    </div>
                );
            case 'ui.node.button':
                return (
                    <button key={commonKey} style={{...style, cursor: 'pointer', backgroundColor: '#e0e0e0', padding: '5px 10px', border:'1px solid #999', borderRadius:'4px'}} onClick={() => console.log('Button clicked:', node.id, node.props)}>
                        {String(node.props.label || 'Button')}
                    </button>
                );
            case 'ui.node.window':
                 return (
                    <div key={commonKey} style={{...style, border: '2px solid #333', boxShadow: '0 2px 10px rgba(0,0,0,0.2)', backgroundColor: '#fff', minWidth: '300px', minHeight: '200px'}}>
                        <div style={{background:'#eee', padding:'5px', borderBottom:'1px solid #ccc', fontWeight:'bold'}}>
                             {String(node.props.title || 'Window')}
                        </div>
                        <div style={{padding:'10px'}}>
                             {node.children?.map(childId => renderNode(childId))}
                        </div>
                    </div>
                 );
            default:
                return (
                    <div key={commonKey} style={{...style, color: 'orange', border: '1px solid orange'}}>
                        Unknown kind: {node.kind} ({node.id})
                    </div>
                );
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 10000,
            display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
            <div style={{
                 backgroundColor: 'white', width: '80%', height: '80%', 
                 padding: '20px', borderRadius: '8px', overflow: 'auto',
                 display: 'flex', flexDirection: 'column', color: '#333'
            }}>
                <div style={{display:'flex', justifyContent:'space-between', marginBottom:'20px', flexShrink: 0}}>
                    <h2 style={{margin:0}}>V2 Renderer Preview</h2>
                    <button onClick={onClose} style={{padding:'5px 15px', cursor:'pointer'}}>Close</button>
                </div>
                
                {error && <div style={{color:'red', padding:'20px'}}>Error: {error}</div>}
                
                {!graph && !error && <div>Loading graph...</div>}

                {graph && (
                    <div style={{border:'1px solid #ddd', padding:'20px', flex:1, overflow:'auto', backgroundColor: '#eee'}}>
                         {renderNode(graph.rootNodeId)}
                    </div>
                )}
            </div>
        </div>
    );
}

export default V2RendererPreview;
