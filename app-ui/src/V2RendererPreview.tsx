import { useEffect, useState } from 'react';
import { apiUrl } from './lib/apiBase';

// Minimal types matching backend ResolvedUiGraph
interface ResolvedUiNode {
    id: string;
    type: string;
    props?: Record<string, unknown>;
    children?: string[]; // Child IDs
}

interface ResolvedUiGraph {
    nodesById: Record<string, ResolvedUiNode>;
    slotsById?: Record<string, unknown>;
    rootNodeIds: string[];
}

interface V2RendererPreviewProps {
    onClose?: () => void;
    embedded?: boolean;
    rootId?: string;
    activeVersionId?: string;
}

export function V2RendererPreview({ onClose, embedded, rootId, activeVersionId }: V2RendererPreviewProps) {
    const [graph, setGraph] = useState<ResolvedUiGraph | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchGraph = async () => {
            try {
                // DEBUG LOGGING (Temporary)
                // console.log(`[V2Renderer] Fetching graph... activeVersion=${activeVersionId}`);

                // Single step: Get active resolved graph
                const graphRes = await fetch(apiUrl('/api/config/shell/resolved-graph/active'));
                
                if (graphRes.status === 404) {
                     const errData = await graphRes.json().catch(() => ({}));
                     if (errData.code === "resolved_graph_not_found") {
                         throw new Error("No active V2 graph found. Activate a config containing ui.node.* blocks.");
                     }
                     throw new Error('Graph not found (404)');
                }
                
                if (!graphRes.ok) throw new Error('Failed to fetch resolved graph');
                
                const graphData = await graphRes.json();
                
                // DEBUG LOGGING
                // if (graphData && graphData.nodesById) {
                //    const hasV2Text = !!graphData.nodesById['v2-text-1'];
                //    console.log(`[V2Renderer] Graph loaded. 'v2-text-1' exists? ${hasV2Text}`);
                // }

                setGraph(graphData);
            } catch (err: any) {
                setError(err.message);
            }
        };
        fetchGraph();
    }, [activeVersionId]); // Refresh when version changes

    const renderNode = (nodeId: string) => {
        if (!graph || !graph.nodesById[nodeId]) return <div key={nodeId} style={{color:'red'}}>Missing Node: {nodeId}</div>;
        const node = graph.nodesById[nodeId];

        const style: React.CSSProperties = {
            padding: '10px',
            margin: '5px'
        };

        const commonKey = node.id;

        switch (node.type) {
            case 'ui.node.container':
                // Layout logic
                const directionProp = node.props?.direction || node.props?.layout || 'column';
                const flexDirection = String(directionProp).toLowerCase() === 'row' ? 'row' : 'column';

                return (
                    <div key={commonKey} style={{...style, border: '1px dashed #666', backgroundColor: '#f9f9f9'}}>
                        <small style={{color:'#666', display:'block', marginBottom:'5px'}}>Container ({node.id})</small>
                        <div style={{ display: 'flex', flexDirection: flexDirection, gap: '10px' }}>
                            {node.children?.map(childId => renderNode(childId))}
                        </div>
                    </div>
                );
            case 'ui.node.text':
                const displayText = node.props?.content || node.props?.text || node.props?.value || node.props?.label || "(missing text)";
                return (
                    <div key={commonKey} style={{...style, backgroundColor: 'white', whiteSpace: 'pre-wrap'}}>
                        {String(displayText)}
                    </div>
                );
            case 'ui.node.button':
                const handleButtonClick = async () => {
                     // @ts-ignore
                     const actionId = node.props?.behaviors?.onClick?.actionId;
                     if (actionId) {
                         try {
                            const res = await fetch(apiUrl('/api/actions/dispatch'), {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ actionId, nodeId: node.id })
                            });
                            if (!res.ok) {
                                console.error("Action Dispatch Failed:", res.status);
                            }
                         } catch (e) {
                             console.error("Action Dispatch Network Error:", e);
                         }
                     } else {
                         // Local Fallback
                     }
                };
                
                const displayLabel = node.props?.label || node.props?.text || "Button";
                const helpText = (node.props?.helpText as string) || undefined;
                const isDisabled = node.props?.enabled === false;
                const variant = (node.props?.variant as string) || 'secondary';

                let variantStyle: React.CSSProperties = {
                    backgroundColor: '#e0e0e0',
                    color: '#000000',
                    border: '1px solid #999'
                };

                // Variant Mapping
                switch (variant) {
                    case 'primary':
                        variantStyle = { backgroundColor: '#007acc', color: 'white', border: '1px solid #005a9e' };
                        break;
                    case 'ghost':
                        variantStyle = { backgroundColor: 'transparent', color: '#333', border: '1px solid #ccc' };
                        break;
                    case 'dangerous':
                        variantStyle = { backgroundColor: '#ffebee', color: '#b71c1c', border: '1px solid #ef5350' };
                        break;
                    case 'secondary':
                    default:
                        variantStyle = { backgroundColor: '#e0e0e0', color: '#000000', border: '1px solid #999' };
                        break;
                }

                // Disabled Override
                if (isDisabled) {
                    variantStyle = {
                        backgroundColor: '#d9d9d9',
                        color: '#555555',
                        border: '1px solid #999'
                    };
                }

                return (
                    <button 
                         key={commonKey} 
                         disabled={isDisabled}
                         title={helpText}
                         style={{
                             ...style, 
                             cursor: isDisabled ? 'not-allowed' : 'pointer', 
                             opacity: isDisabled ? 0.9 : 1, // Higher opacity for readability
                             padding: '5px 10px', 
                             borderRadius: '4px',
                             ...variantStyle,
                             fontWeight: variant === 'primary' ? 'bold' : 'normal'
                         }} 
                         onClick={handleButtonClick}
                    >
                        {String(displayLabel)}
                    </button>
                );
            case 'ui.node.window':
                 const windowTitle = node.props?.title || node.props?.label || 'Window';
                 return (
                    <div key={commonKey} style={{...style, border: '2px solid #333', boxShadow: '0 2px 10px rgba(0,0,0,0.2)', backgroundColor: '#fff', minWidth: '300px', minHeight: '200px', display:'flex', flexDirection:'column'}}>
                        <div style={{background:'#eee', padding:'5px', borderBottom:'1px solid #ccc', fontWeight:'bold'}}>
                             {String(windowTitle)}
                        </div>
                        <div style={{padding:'10px', flex:1, overflow:'auto'}}>
                             {node.children?.map(childId => renderNode(childId))}
                        </div>
                    </div>
                 );
            default:
                return (
                    <div key={commonKey} style={{...style, color: 'orange', border: '1px solid orange'}}>
                        Unknown node type: {node.type} ({node.id})
                    </div>
                );
        }
    };

    if (embedded) {
        if (error) return <div style={{color:'red', padding:'20px'}}>Error: {error}</div>;
        if (!graph) return <div>Loading V2 graph...</div>;
        
        const targetId = rootId || (graph.rootNodeIds && graph.rootNodeIds[0]);
        if (!targetId) return <div>No root node found</div>;
        
        return (
            <div style={{height:'100%', overflow:'auto', backgroundColor: '#f0f0f0', color:'#333'}}>
                {renderNode(targetId)}
            </div>
        );
    }

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

                {graph && graph.rootNodeIds && graph.rootNodeIds.length > 0 && (
                    <div style={{border:'1px solid #ddd', padding:'20px', flex:1, overflow:'auto', backgroundColor: '#eee'}}>
                         {renderNode(graph.rootNodeIds[0])}
                    </div>
                )}
            </div>
        </div>
    );
}

export default V2RendererPreview;
