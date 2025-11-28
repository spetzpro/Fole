# Module: core.ui.UiStateStore

## Module ID
core.ui.UiStateStore

## 1. Purpose

The `core.ui.UiStateStore` module owns the **global UI state** for the core application workspace.

It is responsible for:

- Tracking the currently selected project (`currentProjectId`).
- Tracking which main workspace panel is active (`activePanel`).
- Tracking whether the main sidebar is open (`isSidebarOpen`).
- Providing a small subscription API so UI components can react to state changes.

It does **not** own routing, business workflows, or persistence; it is an in-memory UI store for the core shell and feature panels to observe and mutate.

## 2. Responsibilities and Non-Responsibilities

### Responsibilities

- Define the `UiState` model and `ActivePanel` union type.
- Maintain an in-memory instance of `UiState` with a well-defined initial state.
- Provide a singleton-style API (`getUiStateStore`) that returns a store object with:
  - `getState()` — return the current `UiState`.
  - `subscribe(listener)` — register a listener to be called when state changes.
  - `setCurrentProject(projectId | null)` — change the active project.
  - `setActivePanel(panel: ActivePanel)` — change the active workspace panel.
  - `setSidebarOpen(isOpen: boolean)` — explicitly set sidebar open/closed.
  - `toggleSidebar()` — convenience toggle.
- Notify all subscribed listeners whenever the state changes, in a predictable order.

### Non-Responsibilities

- Does **not** interact with the URL or routing (no `window.location`, history, or router bindings).
- Does **not** fetch or persist projects; it only stores the ID.
- Does **not** own feature-specific UI state (map filters, sketch tools, etc.).
- Does **not** perform IO; it is purely in-memory.

## 3. Public API

> This describes the conceptual API. Exact signatures live in
> `src/core/ui/UiStateStore.ts` and must remain compatible with this spec.

### Types

- `type ActivePanel = "default" | "sketch" | "map" | "files" | "settings"`

- `interface UiState {`
  - `currentProjectId: string | null`
  - `activePanel: ActivePanel`
  - `isSidebarOpen: boolean`
  - `}`

- `type UiStateListener = (state: UiState) => void`

### Store interface

Conceptually:

```ts
interface UiStateStore {
  getState(): UiState;
  subscribe(listener: UiStateListener): () => void;
  setCurrentProject(projectId: string | null): void;
  setActivePanel(panel: ActivePanel): void;
  setSidebarOpen(isOpen: boolean): void;
  toggleSidebar(): void;
}
```

The concrete implementation is exported via:

```ts
function getUiStateStore(): UiStateStore;
```

### Behavior

- Initial state:
  - `currentProjectId = null`
  - `activePanel = "default"`
  - `isSidebarOpen = true` (or as defined by the implementation/tests)
- `subscribe(listener)`:
  - Immediately invokes `listener` with the current state (as tested today).
  - Returns an `unsubscribe` function to remove the listener.
- Mutator methods:
  - Update the internal `UiState` atomically.
  - Invoke all subscribed listeners after each change.
  - Must not throw; misbehaving listeners should not corrupt the internal state.

## 4. Internal Model and Invariants

### Invariants

- There is exactly **one global** `UiStateStore` instance per runtime (singleton).
- `UiState` fields are always defined:
  - `currentProjectId` is either a string or `null`, never `undefined`.
  - `activePanel` is always one of the `ActivePanel` union values.
  - `isSidebarOpen` is always boolean.
- Listeners are stored in a simple list; modifications to the list during notification are handled safely (current implementation already behaves predictably and tests will enforce this).

### Evolvability

- New fields may be added to `UiState` in the future (e.g., modal state, notifications).
- New values may be added to `ActivePanel` as new panels are introduced.
- Such changes must be reflected in this spec, and tests must be updated accordingly.

## 5. Planned vs Implemented

### Current status

- **Lifecycle status**: `Implemented`
  - Implementation exists at `src/core/ui/UiStateStore.ts`.
  - Tests exist at `tests/core/uiStateStore.test.ts`.
  - No other modules currently depend on its exact shape, beyond its test and the module itself.

### Planned changes

- Extend `UiState` as more global UI concerns are identified (e.g. toast notifications, modals, filters).
- Add helper APIs (e.g. `resetState()`) if needed by tests or future flows.
- Potential integration with NavigationRouter/AppShell to sync certain pieces of state (e.g. current project) with routing in future.

## 6. Dependencies

### Upstream dependencies

`core.ui.UiStateStore`:

- Has **no imports** today; it is fully self-contained.
- It does not depend on core.foundation, storage, auth, or features.

This is a deliberate design choice that keeps the store extremely lightweight.

### Downstream dependents

- Present:
  - Its own tests (`tests/core/uiStateStore.test.ts`).
- Future:
  - `core.ui.AppShell` and workspace-level components.
  - Feature panels (map, sketch, files, comments, etc.) that want to react to global UI state.

## 7. Error Model

The store is designed to **never throw** in normal usage:

- Public methods (`getState`, `subscribe`, mutators) are synchronous and should not throw for valid input.
- If a listener throws during notification:
  - The store catches the error, logs or surfaces it appropriately (if logging is added later), and continues notifying other listeners.
  - The internal state must remain consistent.

Exact logging/reporting behavior can be refined later; if logging dependencies are introduced, this spec must be updated to reflect them.

## 8. Testing Strategy

Tests MUST cover:

- Initial state:
  - First subscription receives a `UiState` with expected defaults.
- Subscriptions:
  - `subscribe` calls the listener immediately with current state.
  - Updating state triggers listeners with the new `UiState`.
  - `unsubscribe` stops notifications for that listener.
- Mutators:
  - `setActivePanel` changes `activePanel` and notifies subscribers.
  - `setSidebarOpen` and `toggleSidebar` behave as expected.
  - `setCurrentProject` correctly changes the project id.

Existing tests (`tests/core/uiStateStore.test.ts`) already cover the basic subscription and `setActivePanel` behavior. As we add new state fields or behaviors, tests MUST be extended accordingly.

## 9. Performance Considerations

- The store is an in-memory object with a small listener list.
- Mutations are O(N) in number of listeners; this is acceptable for expected UI sizes.
- There is no heavy computation or IO involved.

If the number of listeners grows or more complex logic is added, we may revisit the implementation (e.g., using a more advanced state management approach). Such changes must maintain the semantics described here.

## 10. CI / Governance Integration

Any change to:

- The `UiState` or `ActivePanel` types.
- The behavior of subscriptions or mutators.
- The singleton pattern (`getUiStateStore`).

MUST:

1. Update this spec.
2. Update `src/core/ui/UiStateStore.ts` to match.
3. Update or extend `tests/core/uiStateStore.test.ts`.
4. Keep the `core.ui` block spec and inventory entry in sync with the module’s lifecycle status.
5. Ensure `npm run spec:check` passes from the monorepo root.

AI agents and humans MUST follow `_AI_MASTER_RULES.md` and `Spec_Workflow_Guide.md` when evolving this module.
