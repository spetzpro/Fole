# Module: core.ux.shell.SafeMode

## Module ID
core.ux.shell.SafeMode

## 1. Overview
Defines the behavior of the application when it enters "Safe Mode". This is a restricted operational state used when `active.json` is missing, corrupt, or invalid.

## 2. Inputs and Outputs
- **Input**: System Health Check verification failure.
- **Output**: System State ("Safe Mode" Active).

## 3. Data Formats
- Internal `SafeModeState` flag.

## 4. Error Handling
- Logs entry into Safe Mode with high urgency.
- Suppresses standard error reporting to prevent information leakage.

## 5. Security Notes
- Limits API surface area in Safe Mode.
- Ensuring Admin access remains viable for recovery.

## 6. Implementation Notes
- TODO: Define minimal boot dependencies.
