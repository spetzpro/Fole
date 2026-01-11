# Module: core.ux.shell.ShellConfigDeployAndRollback

## Module ID
core.ux.shell.ShellConfigDeployAndRollback

## 1. Purpose

The Deployment and Rollback module orchestrates the transition of Shell Configurations from a "Candidate" state to an "Active" state. It ensures that only valid, safe configurations reach production users (unless overrides are explicitly authorized) and provides an immediate recovery mechanism via Rollback.

## 2. Scope

This module governs:
-   The `POST /api/config/shell/deploy` endpoint.
-   The `POST /api/config/shell/rollback` endpoint.
-   Atomic activation of configuration bundles.
-   Immutable archival of deployed versions.

## 3. Deployment Flow

### 3.1 Endpoint
**POST** `/api/config/shell/deploy`

### 3.2 Input Payload
The request body MUST conform to the following shape:

```typescript
interface DeployRequest {
  /** The full shell configuration bundle to be deployed */
  bundle: ShellBundle;
  
  /** Optional commit message or description of changes */
  message?: string;
  
  /** 
   * If true, attempts to force deployment despite A1 validation errors.
   * Requires server-side governance approval (ModeGate).
   */
  forceInvalid?: boolean;
}
```

### 3.3 Execution Steps

1.  **Validation Gate**:
    -   The server runs the **ShellConfigValidation** suite (A1/A2/B checks).
    -   **Pass (A1=0)**: Proceed to Archival.
    -   **Fail (A1>0)**:
        -   **Default**: Reject deployment immediately (Fail-Closed).
        -   **Force Invalid**: If `forceInvalid=true` AND `ModeGate` permits (Dev Mode), allow deployment but trigger **Safe Mode**.

2.  **Version Generation**:
    -   Generate a strictly unique `versionId` using the timestamp-based format: `v<Timestamp>` (e.g., `v1736636800000`).

3.  **Immutable Archival**:
    -   Create directory: `config/shell/archive/<versionId>/`
    -   Write Artifacts:
        -   `bundle/*`: The serialized bundle content as flat files, including `shell.manifest.json` and one `<blockId>.json` file per block.
        -   `meta.json`: Metadata (author, timestamp, parentVersionId, mode).
        -   `validation.json`: The full validation report generated in Step 1.
    -   **Rule**: Once written, this archive folder is **immutable**.

4.  **Atomic Activation**:
    -   Update the `active.json` pointer to reference the new `versionId`.
    -   This update MUST be atomic (write temp file -> rename) to prevent race conditions or partial reads.

### 3.4 HTTP Behavior
-   **200 OK**: Deployment Successful. Returns `{ activeVersionId, activatedAt, report, safeMode }`.
-   **400 Bad Request**: Validation Failed (and `forceInvalid` was false/missing). Returns `{ error, report }`.
-   **403 Forbidden**: `forceInvalid` requested but refused by ModeGate.

## 4. Rollback Flow

### 4.1 Endpoint
**POST** `/api/config/shell/rollback`

### 4.2 Input Payload
```typescript
interface RollbackRequest {
  /** The specific version ID to restore (e.g. "v1736636800000") */
  versionId: string;
}
```

### 4.3 Execution Steps

1.  **Verification**:
    -   Check if `config/shell/archive/<versionId>/meta.json` exists.
    -   If missing, fail immediately.

2.  **Safe Mode Reset**:
    -   Rollback acts as the primary recovery mechanism.
    -   It explicitly sets the system state to **Normal Mode** (`safeMode: false`), assuming the target version is valid.
    -   Note: Rollback resets `safeMode` to false but does not re-validate the target archive version at activation time. Operators must rollback only to known-good versions.

3.  **Atomic Activation**:
    -   Update `active.json` to point to the target `versionId`.
    -   Updates `activatedAt` timestamp to current time.

### 4.4 HTTP Behavior
-   **200 OK**: Rollback Successful. Returns `{ activeVersionId, activatedAt }`.
-   **404 Not Found**: The requested `versionId` does not exist in the archive.
-   **400 Bad Request**: Missing `versionId` in payload.

## 5. System Guarantees

### 5.1 All-or-Nothing
Deployment is an atomic operation. The user sees either the old configuration or the new configuration complete. There is no intermediate state where half a bundle is served.

### 5.2 Fail-Closed Default
By default, the deployment pipeline fails closed on any A1 severity error. No invalid configuration can enter the `active` slot without a deliberate, authenticated override.

### 5.3 Rollback Primacy
Rollback is preferred over "Fix Forward". In the event of a bad deployment, operators should rollback to the last known good version rather than attempting to patch the bundle and re-deploy.

## 6. Related Specifications
-   **[ShellConfigGovernance](core.ux.shell.ShellConfigGovernance.md)**: Defines the `ModeGate` logic and permissions for `forceInvalid`.
-   **[ShellConfigStorage](core.ux.shell.ShellConfigStorage.md)**: Defines the directory structure for `archive` and `active.json`.
-   **[ShellConfigValidation](core.ux.shell.ShellConfigValidation.md)**: Defines the A1 severity rules that block deployment.
-   **[SafeMode](core.ux.shell.SafeMode.md)**: Describes the restricted runtime state triggered by forced invalid deployments.
