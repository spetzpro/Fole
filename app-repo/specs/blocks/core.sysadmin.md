# Core Sysadmin Block Specification

**Version:** SPEC_V1.0
**Status:** DRAFT
**Block Namespace:** `sysadmin.*`

## Overview
This specification defines the schema for configuration-driven Sysadmin panels. The Sysadmin UI is defined by blocks within the shell bundle, allowing it to be customized per environment or version.

## Block Types

### 1. Sysadmin Shell (`sysadmin.shell`)
The root container for the Sysadmin UI. It defines the top-level structure (usually tabs) and references other blocks for content.

**Schema:**
```json
{
  "blockType": "sysadmin.shell",
  "data": {
    "title": "System Administration",
    "defaultTabId": "overview",
    "tabs": [
      {
        "id": "overview",
        "label": "Overview",
        "layout": "dashboard",
        "contentBlockIds": ["block-id-1", "block-id-2"]
      },
      {
        "id": "logs",
        "label": "Logs",
        "layout": "full",
        "contentBlockIds": ["block-id-logs"]
      }
    ]
  }
}
```

**Fields:**
- `title` (string): Main title of the panel.
- `defaultTabId` (string, optional): ID of the tab to open by default.
- `tabs` (array): List of tab definitions.

**Tab Definition:**
- `id` (string): Unique identifier for the tab.
- `label` (string): Display text for the tab.
- `layout` (string, optional): Layout hint (e.g., `dashboard`, `full`, `list`). Defaults to `dashboard`.
- `contentBlockIds` (array of strings): List of Block IDs to render in this tab. (Legacy `content` is supported but deprecated).

### 2. Sysadmin Panel Snapshot (`sysadmin.panel.snapshot`)
Renders the State/Snapshot management interface.

**Schema:**
```json
{
  "blockType": "sysadmin.panel.snapshot",
  "data": {
    "title": "State Management"
  }
}
```

### 3. Sysadmin Panel Versions (`sysadmin.panel.versions`)
Renders the Version/Deployment management interface.

**Schema:**
```json
{
  "blockType": "sysadmin.panel.versions",
  "data": {
    "title": "Versions"
  }
}
```

## Recovery Mode
A hardcoded "Recovery Sysadmin" must always be available if the configuration-driven sysadmin fails to load or is invalid. This specification does NOT replace the need for that fallback.
