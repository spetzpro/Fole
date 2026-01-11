# Module: core.ux.shell.ModesAdvancedDeveloper

## Module ID
core.ux.shell.ModesAdvancedDeveloper

## 1. Overview
Manages Developer Mode features, such as "Force Invalid" configuration overrides. Enabling this mode allows bypassing certain validation gates for testing purposes.

## 2. Inputs and Outputs
- **Inputs**: Environment Variables (`FOLE_DEV_FORCE_INVALID_CONFIG`, `FOLE_DEV_ALLOW_MODE_OVERRIDES`), Request Headers.
- **Outputs**: Access Grant/Deny decisions.

## 3. Data Formats
- Boolean flags and Environment Variable parsing.

## 4. Error Handling
- Fail-Closed: Default denies access if flags are inconsistent.

## 5. Security Notes
- **Critical**: Restricted to `localhost` origin.
- Requires dual environment variable confirmation.
- ModeGate prevents accidental exposure in production.

## 6. Implementation Notes
- TODO: Document usage examples.
