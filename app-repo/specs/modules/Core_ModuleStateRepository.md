# Core Module Spec — ModuleStateRepository

## Module ID

`core.moduleStateRepository`

---

## Purpose

The ModuleStateRepository is the **single source of truth** for all persisted module state within a project.

It provides:

- A **uniform API** to read and write each module’s state.
- **Atomic write** semantics to prevent corruption and race conditions.
- **Versioned state records** so modules can evolve over time.
- A clear separation between **module logic** and **storage/concurrency**.

It does **not** define any business logic; it only concerns **how** module state is stored, retrieved, and migrated.

---

## State Shape

The ModuleStateRepository does not own arbitrary business state; instead, it manages **records of module state**.

Conceptually, for each `(projectId, moduleId)` pair, there is **at most one** state record:

```ts
type ModuleStateRecord = {
  // Project this state belongs to
  projectId: string;

  // Module ID, e.g. "core.accessControl", "feature.mapEditor"
  moduleId: string;

  // Opaque JSON blob owned by the module
  state: unknown;

  // Incrementing version number for optimistic concurrency (1, 2, 3, …)
  version: number;

  // Schema version of the module's state structure
  schemaVersion: number;

  // Audit info – always set by the repository
  updatedAt: string;   // ISO timestamp (UTC)
  updatedBy: string;   // userId / system id
};
```

Storage backend is abstracted; actual persistence is handled via the core storage/data access layer (e.g. `ProjectDb`, files, etc.).

The context used by the repository when serving operations:

```ts
type ModuleStateContext = {
  // Project whose module state is being accessed
  projectId: string;

  // Who is performing this change (user or system)
  actorId: string;

  // storage / db / atomic write handles live here,
  // but are opaque to callers
  // db: ProjectDb;
  // atomicWriteService: AtomicWriteService;
  traceId?: string;
};
```

---

## Blocks

The ModuleStateRepository module is primarily an **integration / orchestration module**, but internally it uses these conceptual blocks:

- `core.block.loadModuleState`
  - Purpose: Load a single `ModuleStateRecord` for `(projectId, moduleId)`, or return `null` if none exists.
  - Pure from caller’s perspective (no side effects besides reading storage).

- `core.block.saveModuleStateAtomic`
  - Purpose: Perform an **atomic read-modify-write** cycle for a module’s state using an optimistic concurrency check (`version`).
  - Ensures that only one writer can successfully commit at a time.

- `core.block.listModuleStatesForProject` (optional/extended)
  - Purpose: List all `ModuleStateRecord`s for a given `projectId`.
  - Used primarily for tooling, diagnostics, and migrations.

These blocks are **not** exposed directly to feature modules; they are used behind the public API.

---

## Public API (Operations)

### `getModuleState`

**Signature (conceptual):**

```ts
getModuleState(
  ctx: ModuleStateContext,
  moduleId: string
): Promise<ModuleStateRecord | null>;
```

**Inputs:**

- `ctx`: context including `projectId` and access to storage/DB.
- `moduleId`: ID of the module whose state is requested.

**Outputs:**

- `ModuleStateRecord` if one exists.
- `null` if there is no state yet for that module.

**Behavior:**

- Reads from the underlying project storage (e.g. `ProjectDb`).
- Does **not** perform permission checks; those are handled by higher-level services/modules.
- Does **not** mutate any state.

---

### `writeModuleState`

**Signature (conceptual):**

```ts
writeModuleState(
  ctx: ModuleStateContext,
  moduleId: string,
  expectedVersion: number | null,
  newState: unknown,
  schemaVersion: number
): Promise<ModuleStateRecord>;
```

**Inputs:**

- `ctx`: context including `projectId`, `actorId`, and access to atomic write / storage primitives.
- `moduleId`: module ID whose state is being written.
- `expectedVersion`:
  - If `null`: create a new record; fail if one already exists.
  - If a number: must match the current stored `version`, otherwise fail with a concurrency error.
- `newState`: opaque JSON state owned by the caller module.
- `schemaVersion`: the schema version for this new state.

**Outputs:**

- The newly persisted `ModuleStateRecord` with updated `version`, `schemaVersion`, `updatedAt`, and `updatedBy`.

**Behavior:**

- Uses a **compare-and-swap (CAS)** style conditional write on `(projectId, moduleId, expectedVersion)` via an **atomic write primitive** (`executeAtomicWrite` or equivalent).
- When record does not exist and `expectedVersion === null`, it creates a new record with:
  - `version = 1`
  - `schemaVersion = schemaVersion` (from input)
  - `updatedAt = now (UTC)`
  - `updatedBy = ctx.actorId`
- When record exists and `expectedVersion === currentVersion`, it updates the state and increments `version`:
  - `version = currentVersion + 1`
  - `schemaVersion` is updated, subject to schema rules below.
  - `updatedAt = now (UTC)`
  - `updatedBy = ctx.actorId`
- If `expectedVersion` does **not** match the stored `version`, it throws `ModuleStateConcurrencyError` which includes:
  - `projectId`
  - `moduleId`
  - `expectedVersion`
  - `currentVersion`
- The repository does **not** perform retries on concurrency errors; callers decide whether and how to retry.

---

### `updateModuleState`

Convenience operation that allows callers to pass a **transform function** instead of a fully-formed new state.

**Signature (conceptual):**

```ts
updateModuleState(
  ctx: ModuleStateContext,
  moduleId: string,
  updater: (current: ModuleStateRecord | null) => {
    newState: unknown;
    schemaVersion: number;
    expectedVersion: number | null;
  }
): Promise<ModuleStateRecord>;
```

**Inputs:**

- `ctx`: context including `projectId`, `actorId`, access to storage/atomic write.
- `moduleId`: module ID.
- `updater`: pure function that receives the current `ModuleStateRecord | null` and returns the desired new state and expected version.

**Outputs:**

- The persisted `ModuleStateRecord` after the update.

**Behavior:**

- Executes within a single **atomic read-modify-write** transaction (same CAS semantics as `writeModuleState`).
- Ensures that no other writer can interleave between read and write.
- Encapsulates the typical “load -> change -> save” pattern safely.
- Concurrency errors surface as `ModuleStateConcurrencyError` and are not automatically retried.

---

### `listModuleStatesForProject` (optional / tooling)

**Signature (conceptual):**

```ts
listModuleStatesForProject(
  ctx: ModuleStateContext
): Promise<ModuleStateRecord[]>;
```

**Inputs:**

- `ctx`: includes `projectId` (and `actorId` for audit, though it may not affect behavior here).

**Outputs:**

- All `ModuleStateRecord`s for that project.

**Behavior:**

- Intended for migrations, diagnostics, and developer tooling.
- Not typically used in normal runtime flows.
- Implementation may add pagination and ordering, but this spec does not require a particular mechanism yet.

---

## Lifecycle

### Initialization

- The ModuleStateRepository itself has no long-lived in-memory state.
- At application startup, it is **wired** with:
  - The **storage abstraction** (e.g. `ProjectDb`, file-based, etc.).
  - The **atomic write/concurrency abstraction**.

### Usage

- Called by:
  - Core modules (e.g. `core.accessControl`, `core.featureMap`).
  - Higher-level services that own business logic and permissions.

- It does **not** initiate work by itself; it only responds to calls.

### Migration / Upgrade

- The `schemaVersion` field allows modules to:
  - Detect when the on-disk state is older than the current schema.
  - Run migration logic in the owning module before writing back.
- ModuleStateRepository itself does not interpret the structure of `state`, but it enforces basic `schemaVersion` rules.

---

### Schema Version Rules

- `schemaVersion` is owned by the module and represents the version of its on-disk state.
- ModuleStateRepository stores `schemaVersion` and returns it unchanged on reads.
- A write **must not decrease** `schemaVersion` for a given `(projectId, moduleId)` pair when a record already exists.
- If a write attempts to set `schemaVersion` to a value lower than the stored one, the repository
  throws `ModuleStateSchemaError`.
- Initial creation (no existing record) may use any positive integer `schemaVersion` (typically `1`).

This prevents accidental schema downgrades and enforces forward-only evolution of module state.

### Deletion

- Deletion of module state is either:
  - Explicit via a future API (e.g. `deleteModuleState`).
  - Implicit when a project is deleted.
- Initial version can omit explicit deletion API and treat deletion as a higher-level concern, but the repository guarantees that **no partial state** remains after a project-level delete.

---

## Dependencies

- **Core Storage / DB Abstraction**
  - E.g. `ProjectDb`, or other project-scoped data store.
  - Used to store and retrieve `ModuleStateRecord`s.
  - Must support efficient lookup by `(projectId, moduleId)` and conditional write on `version`.

- **Atomic Write / Concurrency Service**
  - Provides `executeAtomicWrite`-style semantics.
  - Guarantees that state writes are isolated and consistent.
  - Supports CAS on `version` as part of write conditions.

- **Logging / Diagnostics (optional)**
  - For recording failed writes, concurrency conflicts, etc.

The ModuleStateRepository must **not** depend on:

- Feature modules (to avoid circular references).
- UI modules.

It is part of the **core backend layer**.

---

## Security & Isolation

- All access to module state is scoped by `ctx.projectId`.
- The repository assumes that `projectId` and `actorId` in `ModuleStateContext` have already been authenticated and authorized by higher-level layers (e.g. AccessControl).
- The repository enforces project-level isolation by never reading or writing state for any project other than `ctx.projectId`.
- Encryption at rest and other storage-level security are handled by the underlying storage abstraction and deployment configuration; the repository treats the state blob as opaque.

---

## Error Model

- `ModuleStateConcurrencyError`
  - Thrown when `expectedVersion` does not match the stored `version`.
  - Indicates that another writer has updated the state in the meantime.
  - Includes `projectId`, `moduleId`, `expectedVersion`, and `currentVersion`.

- `ModuleStateSchemaError`
  - Thrown when a write attempts to decrease `schemaVersion` for an existing module state record.
  - Indicates an invalid attempt to roll back the on-disk schema version.

- `ModuleStateNotFoundError`
  - Only applicable if a future API requires “must exist” semantics.
  - Currently, `getModuleState` returns `null` instead of throwing for missing state.

- `ModuleStateStorageError`
  - Wraps low-level storage failures (I/O errors, DB issues).
  - Caller can treat these as retryable or fatal based on context.
  - Guarantees that no partial write has been committed when thrown from `writeModuleState` or `updateModuleState`.

- `ModuleStateSerializationError` (optional/extended)
  - Indicates that state could not be (de)serialized to/from storage.

All errors must be **well-typed** and **non-leaky** (no raw DB errors or secrets surfacing to higher layers).

---

## Test Matrix

The following scenarios must be covered by tests:

1. **Read non-existing state**
   - `getModuleState` returns `null` for unknown `moduleId`.

2. **Create new state (no existing record)**
   - `writeModuleState` with `expectedVersion = null` creates a new record.
   - `version` starts at `1`.
   - `schemaVersion` is stored correctly.
   - `updatedAt` and `updatedBy` are set.
   - `getModuleState` returns the same record.

3. **Update existing state with correct expectedVersion**
   - Existing record with `version = N`.
   - `writeModuleState` with `expectedVersion = N` updates state and sets `version = N+1`.
   - `schemaVersion` follows schema version rules.
   - `updatedAt` and `updatedBy` are updated.

4. **Concurrency conflict**
   - Two concurrent writers:
     - Writer A reads version `N`.
     - Writer B updates to `N+1`.
     - Writer A tries to write with `expectedVersion = N`.
   - Result: Writer A receives `ModuleStateConcurrencyError` with `currentVersion = N+1`.

5. **Update via transform (`updateModuleState`)**
   - Given an existing record, `updateModuleState`:
     - Calls `updater` with current record.
     - Persists the returned new state using CAS semantics.
     - Increments `version`.
   - If a conflict is injected, behavior matches `writeModuleState` (emits `ModuleStateConcurrencyError`).

6. **Per-project isolation**
   - Same `moduleId` in **two different `projectId`s`** must have independent states and versions.
   - Operations with `ctx.projectId = A` never affect state under `projectId = B`.

7. **Schema version handling**
   - Writes with increasing `schemaVersion` values are stored correctly.
   - Attempt to write with `schemaVersion` lower than stored value results in `ModuleStateSchemaError`.

8. **Storage failures**
   - Simulated storage failure (mocked DB/IO error) results in `ModuleStateStorageError`.
   - Verify that no partial write is visible after failure.

9. **Read-after-write**
   - Immediately after a successful `writeModuleState` or `updateModuleState`, `getModuleState` returns the latest version (consistency).

These tests are written at the **core level** and should run with a real/in-memory storage implementation to validate behavior end-to-end.
