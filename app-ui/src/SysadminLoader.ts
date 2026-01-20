// Roadmap #6.1: Sysadmin Schema & Loader
// This file defines the types and parsing logic for the configuration-driven Sysadmin UI.

/**
 * Represents the configuration for the Sysadmin UI, derived from a sysadmin.shell block.
 */
export interface SysadminConfig {
    title: string;
    defaultTabId?: string;
    tabs: SysadminTab[];
    rawBlock: any; // Reference to original block for debugging
}

/**
 * Represents a single tab in the Sysadmin UI.
 */
export interface SysadminTab {
    id: string;
    label: string;
    layout: 'dashboard' | 'full' | 'list' | 'custom';
    contentBlockIds: string[];
}

/**
 * Sample Sysadmin Root Block JSON
 * 
 * Use this as a template when creating the block in the bundle.
 * 
 * {
 *   "blockId": "sysadmin-root",
 *   "blockType": "sysadmin.shell",
 *   "data": {
 *     "title": "Extended Admin Panel",
 *     "defaultTabId": "status",
 *     "tabs": [
 *       {
 *         "id": "status",
 *         "label": "System Status",
 *         "layout": "dashboard",
 *         "content": ["metric-cpu", "metric-memory", "service-health"]
 *       },
 *       {
 *         "id": "advanced",
 *         "label": "Advanced Config",
 *         "layout": "full",
 *         "content": ["json-editor-block"]
 *       }
 *     ]
 *   }
 * }
 */

/**
 * Locates the Sysadmin Root block in the provided blocks map/array.
 * Strategy: Look for blockType === "sysadmin.shell".
 */
export function findSysadminBlock(blocks: Record<string, any> | any[]): any | null {
    if (!blocks) return null;

    const blocksArray = Array.isArray(blocks) 
        ? blocks 
        : Object.values(blocks);

    // Find the first block with type 'sysadmin.shell'
    return blocksArray.find(b => b && b.blockType === 'sysadmin.shell') || null;
}

/**
 * Parses the sysadmin root block into a structured config.
 * Returns null if the block is invalid.
 */
export function parseSysadminConfig(block: any): SysadminConfig | null {
    if (!block || block.blockType !== 'sysadmin.shell') return null;
    
    const data = block.data || {};

    // Validate minimal requirements
    if (!Array.isArray(data.tabs)) {
        console.warn('SysadminLoader: Block found but missing "tabs" array.', block);
        return null; // Invalid schema
    }

    const config: SysadminConfig = {
        title: typeof data.title === 'string' ? data.title : 'Sysadmin',
        defaultTabId: typeof data.defaultTabId === 'string' ? data.defaultTabId : undefined,
        rawBlock: block,
        tabs: data.tabs.map((t: any) => ({
            id: String(t.id || 'tab-' + Math.random().toString(36).substr(2, 5)),
            label: String(t.label || 'Unnamed Tab'),
            layout: ['dashboard', 'full', 'list', 'custom'].includes(t.layout) ? t.layout : 'dashboard',
            contentBlockIds: Array.isArray(t.content) ? t.content.map(String) : []
        }))
    };

    return config;
}
