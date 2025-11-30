# AI Guidance: Storage Architecture

File: `specs/core/_AI_STORAGE_ARCHITECTURE.md`  
Scope: How the AI should think about filesystem layout, STORAGE_ROOT, project folders, and how this ties into the `core.storage` modules.

---

## 1. Goals

The storage architecture must:

- Be **predictable** and **inspectable** on disk (easy to debug).
- Keep **project data isolated** from each other.
- Support **safe concurrent access** and **atomic writes** where required.
- Work well with both local development and future remote/hosted scenarios.
- Integrate cleanly with the module system (`core.storage.*`).

This document is *conceptual*. Concrete contracts live in:

- `specs/modules/core.storage/core.storage.ProjectModel.md`
- `specs/modules/core.storage/core.storage.ProjectPathResolver.md`
- `specs/modules/core.storage/core.storage.FileStorage.md`
- `specs/modules/core.storage/core.storage.ProjectRegistry.md`
- `specs/modules/core.storage/core.storage.DalContextFactory.md`
- `specs/modules/core.storage/core.storage.MigrationRunner.md`
- `specs/modules/core.foundation/core.foundation.ConfigService.md`

### 1.5 Current Implementation Status (MVP)

- `ProjectModel`, `ProjectPathResolver`, `ProjectRegistry`, and `DalContextFactory` are implemented and used in real flows.
- The **atomic write stack** (StoragePaths/ManifestRepository/AtomicWriteService/AtomicWriteExecutor/diagnostics) is implemented and tested and is the canonical way to perform critical, manifest-backed writes.
- `FileStorage` exists and provides **non-atomic** IO helpers; it is suitable for utility writes but not for persistent, multi-step operations that require atomicity.
- A dedicated `core.storage.MigrationRunner` module is Specced, but migrations are currently orchestrated directly by the DB migration layer (`src/core/db/migrations/**`) and project-level initialization logic.
- Feature modules (e.g. `feature.map`) currently use project DBs and the atomic write stack only for a subset of flows; some write operations are still NotImplemented.

When tightening or using this spec, treat it as the **target model**, with the above as the current MVP slice.

---

## 2. STORAGE_ROOT and High-Level Layout

All application data lives under a **single root directory**, called `STORAGE_ROOT`.

In dev this might be:

- `./.storage/` inside the repo  

In production it might be:

- `/var/fole-data/`  
- or any admin-configured path.

`STORAGE_ROOT` is configured via:

- `ConfigService.getAppConfig().storage.projectsRoot` (or similar).

### 2.1 Project-Oriented Layout

Within `STORAGE_ROOT`, projects are stored under a `projects/` folder:

```text
STORAGE_ROOT/
  projects/
    <projectId>/
      project.json
      project.db
      files/
        ...
      tmp/
        ...
```

Key points:

- `projectId` is a **stable identifier** (string/UUID).
- Each project gets its **own folder**, with:
  - Metadata/config in `project.json` (shape defined in `ProjectModel`).
  - A SQLite DB in `project.db` (schema managed by migrations).
  - Binary files in `files/`.
  - Temporary files in `tmp/`.

No other code should construct paths by hand; instead, it uses:

- `core.storage.ProjectPathResolver`.

---

## 3. ProjectPathResolver & ProjectRegistry

### 3.1 ProjectPathResolver

Responsibility:

- Map a `projectId` → canonical filesystem paths.

Examples:

- `getProjectRoot(projectId)` → `STORAGE_ROOT/projects/<projectId>/`
- `getProjectDbPath(projectId)` → `.../project.db`
- `getProjectFilesRoot(projectId)` → `.../files/`
- `getProjectTmpRoot(projectId)` → `.../tmp/`

All code that needs paths should **go through** `ProjectPathResolver`, ensuring:

- consistent layout
- easier refactors later (e.g. moving project DBs elsewhere).

### 3.2 ProjectRegistry

Responsibility:

- Track **which projects exist**.
- Provide APIs to:
  - list projects
  - create new projects
  - delete/soft-delete projects (later)

Implementation details:

- New project creation:
  - generate `projectId`
  - create project folder using `ProjectPathResolver`
  - create/initialize `project.json`
  - **MVP:** initialize DB schema via migrations invoked by project bootstrap logic.
  - **Target:** delegate schema initialization to `core.storage.MigrationRunner` once implemented.

---

## 4. Database Files per Project

Each project has a single primary SQLite DB file:

- `project.db` under the project root.

This DB contains:

- project-local data such as:
  - maps
  - sketches
  - comments
  - files metadata
  - calibration metadata
  - etc. (as the schema evolves)

Rules:

- Code must not assume one global DB for all projects.
- DAL (Data Access Layer) usage should be **per-project** via:
  - `core.storage.DalContextFactory` (which uses `ProjectPathResolver` and `project.db`).

---

## 5. File Storage

Binary/project files (images, PDFs, photos, etc.) live under:

```text
STORAGE_ROOT/projects/<projectId>/files/
```

File layout is managed by:

- `core.storage.FileStorage` for low-level IO helpers.
- `core.storage.AtomicWriteService` + manifest/diagnostics stack for **critical** writes that must be atomic and observable.

Key rules:

- Only `FileStorage`, `ProjectPathResolver`, and the atomic write stack know exact file layout and trace/manifest semantics.
- Higher-level code uses **logical identifiers** rather than raw paths.
- Writes that represent **persistent project state** (e.g. manifests, index files, DB-like structures) should use the atomic write pipeline:
  - write to `tmp/` then move into `files/` when complete, with manifests and diagnostics.
- Simple, non-critical writes (e.g. transient exports, logs) may use `FileStorage` write helpers directly, as long as they do not break invariants.

---

## 6. Temporary Files and Atomic Writes

`tmp/` exists per project:

```text
STORAGE_ROOT/projects/<projectId>/tmp/
```

Usage:

- Staging area for partial writes and intermediate artifacts:
  - asynchronous processing
  - image transformations
  - tile generation
  - exports before finalization
- Helps guarantee:
  - no half-written files in `files/`
  - safe rollbacks on failure

Pattern for atomic writes (target model):

1. Write the resulting file to `tmp/` (e.g. `tmp/<uuid>.part`).
2. Validate/check file (size, checksum, etc.).
3. Move/rename into `files/` (or wherever the final path is).
4. Update manifest and emit diagnostics via the atomic write stack.
5. Clean up old temp files periodically.

The exact temp naming and cleanup strategy is implemented inside `AtomicWriteService` and pipeline-specific modules.  
**MVP note:** Some simple flows may still use non-atomic writes; those should be upgraded over time per this pattern.

---

## 7. Migrations and Schema Evolution

Database schema is managed conceptually by:

- `core.storage.MigrationRunner`.
- The DB migration layer in `src/core/db/migrations/**`.

Responsibilities (target):

- On project creation:
  - Create fresh schema at latest version.
- On project open:
  - Detect current schema version.
  - Run required migrations in order.

**Current MVP reality:**

- Migrations are implemented in `src/core/db/migrations/**` and are invoked by project-level bootstrap logic.
- A dedicated MigrationRunner module in `core.storage` is Specced but not yet implemented.
- When MigrationRunner is introduced, it will encapsulate the orchestration and align with these rules.

Migrations themselves must:

- Live in a structured place (e.g. `src/core/db/migrations`).
- Be **repeatable** and **idempotent** at the step level.
- Never silently drop data without explicit intent.

Error handling:

- If a migration fails, the project should not be used until resolved.
- Surface a clear `AppError` if migration fails, log full details, and emit diagnostics.

---

## 8. Concurrency Considerations (High-Level)

Concurrency on storage is covered in more detail in:

- `_AI_CONCURRENCY_AND_LOCKING_SPEC.md`

In short:

- SQLite access per project is serialized logically via DAL-level locks.
- File writes:
  - should use atomic patterns (tmp → move) for critical files.
  - should not be performed concurrently to the same logical file without coordination.

---

## 9. Relationship to Other Specs

- `_AI_DB_AND_DATA_MODELS_SPEC.md`
  - describes logical DB schemas and relations.
- `_AI_FILE_AND_IMAGE_PIPELINE_SPEC.md`
  - describes how image data flows into storage and how tiles/derivatives are stored.
- `_AI_GEO_AND_CALIBRATION_SPEC.md`
  - describes how calibration and geo transforms are stored (often in `project.db`).
- `_AI_ERROR_HANDLING_AND_DIAGNOSTICS_SPEC.md`
  - describes how storage errors should be surfaced and logged.

Together with this file, they form the storage & data backbone of the system (target state).  
The MVP implementation is a subset of this, as described above.
