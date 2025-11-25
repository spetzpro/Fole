# Core Module Spec — CoreUI (Final, Updated with Decisions 1A / 2B / 3B)

## Module ID
`core.ui`

---

# Purpose
CoreUI defines **UI primitives**, **view-model contracts**, and **standard patterns** for representing:

- async loading/data/error states  
- user-visible notifications (global + local/panel-scoped)  
- capability flags derived from permissions  
- safe UI error shapes  

CoreUI does **not** implement framework-level UI; it defines the **data structures** that the frontend consumes.

---

# Decisions Applied
### ✅ Decision 1A — View-model decides when to notify  
CoreUI **does not** auto-show notifications for errors.  
View-models explicitly choose:

- toast (global or local)  
- inline error  
- no user-facing error  

### ✅ Decision 2B — Support both global and local notifications  
Notifications may be:

- **Global** (e.g., session expired, project failed to load)  
- **Local** to a panel/view (e.g., map editor save error)  

CoreUI supports both.

### ✅ Decision 3B — Typed capability objects per feature  
Instead of flat `canEdit`, `canDelete` maps, features define:

```ts
type MapEditorCapabilities = {
  canEditMap: boolean;
  canDeleteLayers: boolean;
  canCreateMarkers: boolean;
}
```

CoreUI only defines the pattern for deriving capability objects.

---

# State Shape
CoreUI is **mostly stateless**.

Optional future-persisted preferences:

```ts
type CoreUiState = {
  preferencesByPrincipal?: Record<string, UiPreferenceRecord>;
};

type UiPreferenceRecord = {
  principalId: string;
  theme?: "light" | "dark" | "system";
  density?: "comfortable" | "compact";
};
```

---

# Core Types

## Async State

```ts
type AsyncStatus = "idle" | "loading" | "success" | "error";

type AsyncState<TData> = {
  status: AsyncStatus;
  data?: TData;
  error?: UiError | null;
};
```

---

## UI Error Shape

```ts
type UiErrorSeverity = "info" | "warning" | "error";

type UiError = {
  code: string;
  message: string;
  details?: string;
  severity: UiErrorSeverity;
  traceId?: string;
};
```

Errors are mapped from domain/core errors.

---

## Notifications (Global + Local)

```ts
type NotificationType = "info" | "success" | "warning" | "error";
type NotificationId = string;

type UiNotification = {
  id: NotificationId;
  type: NotificationType;
  title: string;
  message: string;

  // auto-dismiss behavior
  autoDismissMs?: number | null;

  // added scope (Decision 2B)
  scope?: "global" | { panelId: string };
};
```

---

## Capability Objects (Typed per Feature)

CoreUI defines **the pattern**, not the fields:

```ts
type DeriveCapabilitiesFn<TCapabilities> = 
  (permCtx: PermissionContext) => TCapabilities;
```

Feature modules create specific capability objects.

---

# Blocks

### `core.ui.block.buildAsyncState`
Wraps async logic into `AsyncState<T>`.

### `core.ui.block.mapDomainErrorToUiError`
Domain/core → UI-safe error mapping.

### `core.ui.block.notificationStore`
Stores notifications in:
- global list  
- panel-scoped lists keyed by `panelId`

### `core.ui.block.deriveCapabilities`
Applies typed capability rule functions.

---

# Public API

## buildAsyncStateFromPromise

```ts
buildAsyncStateFromPromise<T>(promise: Promise<T>): Promise<AsyncState<T>>;
```

---

## mapDomainErrorToUiError

```ts
mapDomainErrorToUiError(error: unknown): UiError;
```

Behavior:
- Known errors mapped to structured codes/messages
- Unknown errors → safe fallback
- No throwing

---

## Notification APIs

### pushNotification

```ts
pushNotification(n: UiNotification): void;
```

### removeNotification

```ts
removeNotification(id: NotificationId): void;
```

### listNotifications

```ts
listNotifications(scope?: "global" | { panelId: string }): UiNotification[];
```

This implements **Decision 2B**.

---

## deriveCapabilities

```ts
deriveCapabilities<T>(permCtx: PermissionContext, fn: DeriveCapabilitiesFn<T>): T;
```

Implements **Decision 3B**.

---

# Lifecycle

### Initialization
- register error mappings  
- initialize notification stores  
- no persistent state required  

### Usage
Used by all view-models to create strongly typed UI output.

### Migration/Upgrade
Changes to core UI types must be coordinated with `_AI_UI_SYSTEM_SPEC.md`.

---

# Dependencies

- `core.accessControl` (PermissionContext)
- core/domain error types

CoreUI must **not** depend on feature modules or frontend frameworks.

---

# Security & UX Rules

- No secrets in error messages  
- Unknown errors → safe generic UI error  
- View-models decide notification behavior (**Decision 1A**)  
- Local notifications scoped only to the active panel  

---

# Test Matrix

1. Async success  
2. Async error (known domain error)  
3. Async error (unknown error → safe fallback)  
4. Global notifications CRUD  
5. Panel-scoped notifications CRUD  
6. Capability derivation  
7. TraceId propagation  

This ensures CoreUI stays predictable and safe across the entire app.
