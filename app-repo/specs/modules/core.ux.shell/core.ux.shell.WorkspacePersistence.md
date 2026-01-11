# Module: core.ux.shell.WorkspacePersistence

## Module ID
core.ux.shell.WorkspacePersistence

## 1. Purpose and Scope

This module governs the mechanics of **tab-scoped workspace persistence**. It defines how the Shell remembers the precise arrangement of windows, layout configuration, and viewing state for a specific browser tab or "Workspace Session".

### 1.1 Scope
-   **Per-Tab Isolation**: Each browser tab is treated as a distinct workspace context. State changes in one tab MUST NOT affect the layout of another tab, even if they view the same underlying project data.
-   **Local Storage Only**: This state is strictly local to the device/browser. It is **NOT** synchronized to the server or shared across devices.
-   **Lifecycle Governance**: Defines the creation, duplication (forking), and destruction (garbage collection) of these session states.

### 1.2 Out of Scope
-   **Project Data**: The actual content *inside* a window (e.g., the text in a document) is persisted by the Feature modules (e.g., `core.storage`) and is synced. This module only cares about the *container* (window position, size, visibility).

## 2. Workspace Session Identity (TabId)

The **TabId** is the unique key binding a browser tab to a persisted layout state in the storage backend.

### 2.1 Lifecycle
1.  **Creation**: On Shell initialization, the system checks for an existing `TabId` in the browser's `sessionStorage`.
    -   If found: It attempts to hydrate layout from the storage backend using this ID.
    -   If missing: A new UUIDv4 is generated and written to `sessionStorage` with the key `FOLE_SHELL_TAB_ID`.
2.  **Persistence**: The `TabId` MUST be stored in `sessionStorage`. This ensures it survives page reloads (F5) but is cleared when the tab is closed (unless the browser supports session restore).
3.  **Corruption Handling**: If a `TabId` exists in `sessionStorage` but points to corrupted or missing data in the backend, the system MUST treat it as a fresh session and initialize with default defaults, flagging the ID as dirty or generating a new one.

## 3. Tab Duplication and Forking

When a user duplicates a browser tab, modern browsers copy the `sessionStorage` to the new tab. This results in two active tabs claiming the same `TabId`. To prevent race conditions and layout thrashing, strict **Fork-on-Mutate** logic is enforced.

### 3.1 Detection
On startup, the Shell MUST perform an ownership check (e.g., via `BroadcastChannel` or a heartbeat lock in `localStorage`):
-   **Owner**: The first tab to register/heartbeat on the `TabId`.
-   **Clone**: A subsequent tab initiating with an already-active `TabId`.

### 3.2 The "Clone" State
A "Clone" tab initially operates in **Read-Only Sync Mode** regarding the workspace identity.
-   It loads the current state of the parent `TabId`.
-   It acknowledges it is a clone.

### 3.3 Fork-on-First-Mutation
The moment a user performs a layout mutation in the "Clone" tab (e.g., moves a window, opens a panel):
1.  **Generate**: A new unique `TabId` (UUID) is created for this tab.
2.  **Snapshot**: The layout state from the *original* `TabId` is deep-copied.
3.  **Persist**: The snapshot is saved under the *new* `TabId`.
4.  **Update**: `sessionStorage` is updated to the new `TabId`.
5.  **Apply**: The user's mutation is applied to the new isolated state.

This ensures that simply duplicating a tab does not explode storage usage, but *working* in a duplicated tab immediately isolates it.

## 4. Storage Backend Requirements

### 4.1 Storage Keys
Layout state is stored in the browser's `localStorage` (or `IndexedDB` for larger datasets) using the following convention:
-   **Data Key**: `fole_shell_ws_{tabId}`
-   **Index Key**: `fole_shell_ws_index` (Registry of all known IDs and their last-access timestamps).

### 4.2 Constraints
-   **Fail-Soft**: If `localStorage` quota is exceeded:
    1.  Trigger an immediate Garbage Collection (See Section 5).
    2.  Retry the save.
    3.  If still failing, log a warning and degrade to in-memory persistence only (changes lost on reload). **Do not crash the application.**

### 4.3 Data Retention
-   State must survive page reloads.
-   State must survive browser restarts (if `localStorage` is not cleared by user).

## 5. Garbage Collection (GC) Policy

To prevent `localStorage` pollution from ephemeral tabs, a strict GC policy is enforced.

### 5.1 Triggers
GC runs:
1.  **On Startup**: Immediately after loading the shell.
2.  **Periodically**: Every 30 minutes during active use.
3.  **On Quota Pressure**: When a write fails.

### 5.2 Eviction Rules
The system maintains a `fole_shell_ws_index` tracking `lastAccessed` timestamps.
1.  **TTL (Time-To-Live)**: Any workspace state not accessed in **7 days** is deleted.
2.  **LRU (Least Recently Used)**: If the total number of stored workspaces exceeds **20**, the oldest entries are deleted regardless of TTL until the count is within limits.
3.  **Orphan Check**: (Optional) If reliable tab-closing detection exists, data for closed tabs may be aggressively pruned, though `session restore` features usually make this undesirable.

## 6. Related Specifications

-   **[WindowSystem](core.ux.shell.WindowSystem.md)**: Consumes this persistence service to save window coordinates.
-   **[Project Workspace Experience](../../ux/Project_Workspace_Experience.md)**: Defines the high-level user goals for spatial organization that this persistent layer supports.

