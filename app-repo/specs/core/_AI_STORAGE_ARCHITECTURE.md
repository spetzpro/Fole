# AI Guidance: Storage Architecture

File: `specs/core/_AI_STORAGE_ARCHITECTURE.md`  
Scope: How the AI should think about filesystem layout, STORAGE_ROOT, project folders, and how this ties into the `core.storage` modules.

---

## 1. Goals

The storage architecture must:

- Be **predictable** and **inspectable** on disk (easy to debug).
- Keep **project data isolated** from each other.
- Support **safe concurrent access** and **atomic writes**.
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
  - A SQLite DB in `project.db` (schema managed by `MigrationRunner`).
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
  - trigger DB migrations via `MigrationRunner` → `project.db`.

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

- `core.storage.FileStorage`.

Key rules:

- Only `FileStorage` and `ProjectPathResolver` know exact file layout.
- Higher-level code uses **logical identifiers** rather than raw paths.
- Writes should be **atomic** as much as practical:
  - write to `tmp/` then move into `files/` when complete.
- File naming should be:
  - stable (so paths can be referenced later)
  - non-leaky (avoid including user secrets in filenames).

---

## 6. Temporary Files and Atomic Writes

`tmp/` exists per project:

```text
STORAGE_ROOT/projects/<projectId>/tmp/
```

Usage:

- Staging area for partial writes:
  - asynchronous processing
  - image transformations
  - tile generation
  - exports before finalization
- Helps guarantee:
  - no half-written files in `files/`
  - safe rollbacks on failure

Pattern for atomic writes:

1. Write the resulting file to `tmp/` (e.g. `tmp/<uuid>.part`).
2. Validate/check file (size, checksum, etc.).
3. Move/rename into `files/` (or wherever the final path is).
4. Clean up old temp files periodically.

The exact temp naming and cleanup strategy can be implemented inside `FileStorage` and pipeline-specific modules.

---

## 7. Migrations and Schema Evolution

Database schema is managed by:

- `core.storage.MigrationRunner`.
- `core.storage.DalContextFactory` ensures `MigrationRunner` has the correct DB path.

Responsibilities:

- On project creation:
  - Create fresh schema at latest version.
- On project open:
  - Detect current schema version.
  - Run required migrations in order.
- Handle failures gracefully:
  - bubble up a clear `AppError` if migration fails.
  - do not run the app against a partially-migrated DB.

Migrations themselves:

- Live in a structured place (e.g. `src/core/storage/migrations`).
- Are **repeatable** and **idempotent** at the step level.

---

## 8. Concurrency Considerations (High-Level)

Concurrency on storage is covered in more detail in:

- `_AI_CONCURRENCY_AND_LOCKING_SPEC.md`

But in short:

- SQLite access per project is serialized logically via DAL-level locks.
- File writes:
  - should use atomic patterns (tmp → move).
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

Together with this file, they form the storage & data backbone of the system.
