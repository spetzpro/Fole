# Module: core.ux.shell.ShellConfigStorage

## Module ID
core.ux.shell.ShellConfigStorage

# Module: core.ux.shell.ShellConfigStorage

## Module ID
core.ux.shell.ShellConfigStorage

## 1. Purpose
The Storage module abstracts the file system for the Shell Configuration system. It manages the runtime persistence of configuration artifacts, ensuring consistency, atomicity, and safe recovery.

It provides the physical "source of truth" for the application state described in the [Governance Spec](core.ux.shell.ShellConfigGovernance.md).

## 2. Directory Layout

The shell configuration is split into two primary zones: **Defaults** (committed to git) and **Runtime** (server-local, gitignored).

### 2.1 Default Configuration (Git-Tracked)
Located at: `app-repo/config/defaults/shell/`

Structure:
```text
app-repo/config/defaults/shell/
├── active.json                      # The default active pointer
└── archive/
    └── v1/                          # The initial "factory" state
        ├── meta.json                # Default metadata
        ├── validation.json          # Default validation (must be clean)
        └── bundle/
            ├── shell.manifest.json  # Root manifest
            ├── header.json
            ├── viewport.json
            └── footer.json
```

### 2.2 Runtime Configuration (Gitignored)
Located at: `app-repo/config/shell/` (Created at runtime)

Structure:
```text
app-repo/config/shell/
├── active.json                      # Single source of truth for running app
├── active.json.<timestamp>.tmp      # Transient atomic write file
└── archive/
    ├── v1/                          # Copied from defaults
    └── v<Timestamp>/                # Deployed versions
        ├── meta.json                # Deployment metadata
        ├── validation.json          # Validation report snapshot
        └── bundle/                  # The Full Configuration Bundle
            ├── shell.manifest.json
            ├── <BlockId>.json       # Individual block definitions
            └── ...
```

## 3. Initialization Rules

The initialization process ("Boot") protects the server from starting in an undefined state.

1.  **Check Runtime Existence**: The server checks for `app-repo/config/shell/active.json`.
2.  **Auto-Initialization**: 
    - If the `config/shell` directory or `active.json` is missing, the system **automatically copies** the entire contents of `config/defaults/shell/` to `config/shell/`.
    - This ensures a fresh install starts with a valid, git-tracked configuration (v1).
3.  **Missing Defaults**:
    - If `config/defaults/shell/` is missing or empty, initialization **fails immediately** (Fail-Closed).
    - The server logs a critical error and exits. It does not attempt to generate a config from code.

## 4. Atomic Write Rules

Concurrency is managed via strict filesystem semantics.

1.  **Immutability**: The `archive/` folder is append-only. Once a version folder (e.g., `v1736630000000`) is written, it is never modified.
2.  **Pointer Atomicity**:
    - Updates to `active.json` define the system state change.
    - **Mechanism**:
      1. Write payload to `active.json.<timestamp>.tmp` (on the same logical volume).
      2. Flush/Sync file attributes.
      3. **Rename** `active.json.<timestamp>.tmp` to `active.json`.
    - This ensures `active.json` is never partially written or corrupt, even on power loss.

## 5. Artifact Naming & Formats

-   **Version IDs**: 
    -   Format: `v<Timestamp>` (e.g., `v1736631234567`)
    -   Exceptions: `v1` (Reserved for factory default).
-   **Block Files**:
    -   Naming: `<BlockId>.json` (e.g., `header.json`, `tool.measure.json`).
    -   Blocks must be flat files inside the `bundle/` directory. Subdirectories are not supported for blocks.

## 6. Operational Notes

### 6.1 Inspecting State
Administrator can verify the current state by inspecting `app-repo/config/shell/active.json`.
```json
{
  "activeVersionId": "v1736631234567",
  "lastUpdated": "2026-01-11T12:00:00.000Z",
  "safeMode": false,
  "activatedByMode": "normal"
}
```

### 6.2 Manual Rollback (Emergency)
If the server APIs are unresponsive, a manual rollback can be performed via the filesystem:

1.  Stop the server process.
2.  Navigate to `app-repo/config/shell/`.
3.  Identify a known-good version ID in `archive/` (e.g., `v1`).
4.  Edit `active.json` to set `"activeVersionId": "v1"`.
    - *Optional*: Set `"safeMode": true` if you wish to force Safe Mode booting.
5.  Restart the server.

## 7. Related Specs

-   **[ShellConfigGovernance](core.ux.shell.ShellConfigGovernance.md)**: Defines the meaning of the files stored here.
-   **[ShellConfigValidation](core.ux.shell.ShellConfigValidation.md)**: Ensures only valid bundles are written to the archive.
-   **[ShellConfigDeployAndRollback](core.ux.shell.ShellConfigDeployAndRollback.md)**: The active user of this storage layer.
-   **[SafeMode](core.ux.shell.SafeMode.md)**: Defines behavior when `active.json` enables the safety flag.
