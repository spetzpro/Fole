# Module: core.ux.shell.ShellConfigValidation

## Module ID
core.ux.shell.ShellConfigValidation

## 1. Purpose
The Validation module ensures that Shell Bundles comply with the structural and relational rules required for safe execution. It acts as the "Gatekeeper" that prevents invalid configurations from being deployed or served.

It operates on a Fail-Closed principle: any ambiguity or error results in rejection.

## 2. Validation Layers

Validation is performed in two distinct passes:

### 2.1 JSON Schema Validation
-   **Engine**: Ajv (Another JSON Schema Validator).
-   **Schemas**: 
    -   `shell-bundle.schema.json`
    -   `shell-manifest.schema.json`
    -   `block-envelope.schema.json`
-   **Checks**: Type constraints, required fields, format correctness.

### 2.2 Referential Integrity
-   **Logic**: Custom logic extending schema checks.
-   **Checks**: Verified that every `blockId` referenced in `manifest.regions` exists within the `blocks` map of the bundle.
-   **Severity**: Missing blocks are treated as fatal A1 errors.

## 3. Execution Points

Validation is mandatory at multiple lifecycle boundaries:

1.  **Deployment (POST)**: 
    -   Every deployment candidate is fully validated before writing to disk.
    -   Failures block the write unless "Force Invalid" is authorized.
2.  **Retrieval (GET)**: 
    -   When fetching a bundle to serve to the client, the server may optionally re-validate to ensure data integrity on disk has not degraded.

## 4. Severity Model

The system enforces a tiered severity model. Currently, only A1 is active.

### 4.1 Tier A1: Fatal / Blocking
-   **Definition**: Structural invalidity that guarantees runtime failure.
-   **Examples**: 
    -   Schema violation (wrong data type, missing property).
    -   Manifest references a non-existent block.
-   **Behavior**:
    -   Reject Deployment (400 Bad Request).
    -   Force Safe Mode if override used.

### 4.2 Tier A2: Critical / Warning (Reserved)
-   **Status**: Reserved for future use. Not currently implemented.
-   **Defined Intent**: Deprecated features or performance risks.

### 4.3 Tier B: Informational (Reserved)
-   **Status**: Reserved for future use. Not currently implemented.
-   **Defined Intent**: Stylistic suggestions (non-blocking).

**Note**: The current implementation emits **only A1 findings**.

## 5. Data Structures

The validation result is captured in a formal report object.

### 5.1 ValidationReport
```typescript
interface ValidationReport {
  status: "valid" | "invalid";
  validatorVersion: string; // e.g. "1.0.0"
  severityCounts: {
    A1: number;
    A2: number;
    B: number;
  };
  errors: ValidationError[];
}
```

### 5.2 ValidationError
```typescript
interface ValidationError {
  severity: "A1" | "A2" | "B";
  code: string;       // Schema keyword or custom code (e.g. "missing_block")
  message: string;    // Human readable error
  path: string;       // JSON Pointer to error location
  blockId?: string;   // Context for referential errors
}
```

## 6. HTTP Behavior Contract

The Validator directly influences API status codes.

### 6.1 GET /api/config/shell/bundle
When fetching a bundle to serve to the client, the server MUST validate the bundle and fail-closed if A1 violations are present.

-   **Valid (A1=0)**: Returns `200 OK` with JSON body.
-   **Invalid (A1>0)**: Returns `400 Bad Request` with `ValidationReport` body to prevent client crash. The server refuses to serve invalid configuration.

### 6.2 POST /api/config/shell/deploy
-   **Valid (A1=0)**: 
    -   Writes to Archive.
    -   Updates Active Pointer.
    -   Returns `200 OK`.
-   **Invalid (A1>0)**:
    -   **Default**: Returns `400 Bad Request` with `ValidationReport`. Deployment is blocked.
    -   **Force Invalid**: If authorized (see Governance), activates Safe Mode and returns `200 OK` (with report).

## 7. Related Specs

-   **[ShellConfigGovernance](core.ux.shell.ShellConfigGovernance.md)**: Defines the policy rules and override gates.
-   **[ShellConfigStorage](core.ux.shell.ShellConfigStorage.md)**: Defines the on-disk format of the bundle being validated.
-   **[ShellConfigDeployAndRollback](core.ux.shell.ShellConfigDeployAndRollback.md)**: The consumer of the validation service during deployment.
-   **[SafeMode](core.ux.shell.SafeMode.md)**: The fallback state when A1 errors are forced into production.
