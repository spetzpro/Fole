# AI Guidance: DB & Data Models

File: `specs/core/_AI_DB_AND_DATA_MODELS_SPEC.md`  
Scope: How the AI should think about relational data models, per-project DBs, and how this ties to `core.storage` and other blocks.

---

## 1. Goals

The database layer must:

- Be **predictable** and **easy to reason about**.
- Prefer **simple, normalized schemas** over cleverness.
- Keep **projects isolated** (one DB file per project).
- Support schema evolution via **migrations**.
- Map cleanly to the TypeScript models used in `core.storage` and feature blocks.

This doc is conceptual; concrete code contracts live in:

- `specs/modules/core.storage/core.storage.ProjectModel.md`
- `specs/modules/core.storage/core.storage.DalContextFactory.md`
- `specs/modules/core.storage/core.storage.MigrationRunner.md`

### 1.5 Current Implementation Status (MVP)

- A per-project DB file (`project.db`) is used and exercised by core.storage and feature.map.
- Migrations are implemented in `src/core/db/migrations/**` and orchestrated by project/bootstrap logic.
- MVP schemas focus on:
  - `maps` + `map_calibrations`
  - `project_members`
  - core metadata
  - the minimum tables needed for current features.
- A dedicated `MigrationRunner` module is Specced but not yet wired as the sole orchestrator of migrations.

---

## 2. Per-Project Database Strategy

Each project gets its own SQLite DB file:

- `STORAGE_ROOT/projects/<projectId>/project.db`

Reasons:

- Isolation:
  - easier backup/restore of a single project
  - reduces risk of cross-project data corruption
- Performance:
  - smaller DBs → faster VACUUM/ANALYZE, simpler indexing
- Simplicity:
  - fewer multi-tenant edge cases

Higher-level modules use a per-project DAL context provided by:

- `core.storage.DalContextFactory`.

---

## 3. Core Entities (Conceptual + MVP fields)

Exact schemas live alongside migrations, but conceptually each project DB will handle:

- `project_metadata`
  - one row per project (or a small metadata table)
  - may be mirrored in `project.json` for quick file-based introspection
-- `maps`
  - each floorplan / base image
  - fields like: `id`, `project_id`, `name`, `file_id`, `width`, `height`, `created_at`, etc.
  - **Implementation status:** present in `project.db` migrations and covered by tests.
-- `map_calibrations` (MVP)
  - calibration sets for maps, tying pixel coordinates to world coordinates.
  - **Implementation status (Phase 1):** table is present in `project.db` migrations and exercised by
    FeatureMapService and CalibrationService tests.
  - In the current MVP, migrations and code persist at least the following fields:
    - `id` / `calibration_id`
    - `project_id`
    - `map_id`
    - `is_active` (0/1)
    - `transform_type` (e.g. similarity/affine/other in MVP; may expand later)
    - `rms_error`
    - `created_at`
  - Additional conceptual fields (transform blobs/parameters, `maxResidualError`, `createdByUserId`, and
    separate `calibration_points` tables) are **not yet stored** in `project.db` in this phase and will
    be added when the full calibration lifecycle is implemented.
- `sketch_layers`
  - sketch overlays linked to a map
  - fields like: `id`, `map_id`, `data_blob` (vector data, possibly as JSON or binary), etc.
- `files`
  - metadata about uploaded files
  - fields like: `id`, `original_name`, `mime_type`, `size`, `created_at`, etc.
- `comments`
  - comments linked to a project / map / sketch / file
  - fields like: `id`, `project_id`, `anchor_type`, `anchor_id`, `body`, `created_at`, `created_by`, etc.
- `project_members` (MVP)
  - stores minimal per-project membership rows for permissions:
    - `project_id` (TEXT)
    - `user_id` (TEXT) — matches `CurrentUser.id` in this repo
    - `role_id` (TEXT) — canonical/project role identifier (e.g. `"OWNER"`, `"EDITOR"`, `"VIEWER"`).
  - **Implementation status (Phase 1)**: table is present in `project.db` migrations and exercised by
    `ProjectMembershipService` tests and membership-aware permission flows.
  - Additional conceptual fields (external identity keys, display names, timestamps, audit metadata,
    export/import helpers) are **planned** but not yet implemented.
  - **Future identity fields for import/export mapping (not yet implemented):**
    - Future schema revisions are expected to extend `project_members` with additional fields to support
      robust identity mapping across servers. Design targets include:
      - `user_external_id` (TEXT):
        - A more stable identifier for the user (e.g. email address or identity-provider subject).
        - Used to correlate imported membership rows with local users when possible.
      - `display_name_snapshot` (TEXT):
        - Snapshot of the user’s display name at the time of export.
        - Used for admin-facing mapping UIs even when no automatic match is available.
      - `created_at` / `updated_at` (timestamps):
        - Basic temporal audit fields for membership lifecycle and import history.
      - Optional "import-origin" metadata fields such as:
        - `import_source_server_id` (TEXT) — identifier for the source server or environment.
        - `import_original_user_id` (TEXT) — the original `user_id` from the exporting server.
    - These fields are **not yet present** in the live schema and require future migrations.
    - The current implementation continues to function using `user_id = CurrentUser.id` and `role_id`
      only; additional fields are intended to *augment* (not replace) existing permission checks.
- `permissions` / `sharing` (future)
  - future tables for richer per-project role assignments and sharing models
  - may be local or partly derived from central auth/permissions.

Not all of these need to be present in MVP; the schema can grow over time.

---

## 4. DAL Context and Access Patterns

The Data Access Layer is shaped by:

- `core.storage.DalContextFactory`
  - returns a context object (DalContext) that wraps underlying DB access.

The DAL should expose:

- generic methods (`run`, `all`, etc.) or
- higher-level repository-style functions in feature modules.

General principles:

- DAL methods should preferably return `Result<T, AppError>` at boundaries that are visible to core/block code.
- Throwing should be reserved for unexpected programming errors or low-level framework exceptions.
- SQL queries should be:
  - parameterized (no string interpolation with user data)
  - kept small and explicit
- Avoid burying massive amounts of logic in SQL; keep it at the TypeScript layer whenever possible.

---

## 5. Migrations

Schema evolution is managed by migrations defined in:

- `src/core/db/migrations/**`

And, conceptually, orchestrated by:

- `core.storage.MigrationRunner` (Specced).

Responsibilities (target):

- On project open:
  - detect current schema version (e.g. in a table `schema_version`).
  - apply any pending migrations sequentially.
- On project creation:
  - apply all migrations from version 0 → latest.

Migrations should:

- Be small, focused, and **idempotent** at the step level.
- Be versioned and timestamped in a clear directory structure.
- Never silently drop data without explicit intent.

Error handling:

- If a migration fails, the project should not be used until resolved.
- Surface a clear `AppError` and log details, emitting diagnostics as needed.

---

## 6. Relationship to TypeScript Models

`ProjectModel` and other module specs define the TS-level models used in code.

Rules:

- TS models and DB schemas should be aligned but not necessarily identical 1:1.
  - For example, TS may model nested structures that map to multiple tables.
- Avoid leaking raw DB shapes outside of DAL or repository boundaries.
- When designing a new feature:
  - update the conceptual DB model (this doc if needed),
  - define or update module specs,
  - add migrations,
  - then implement code.

---

## 7. Indexing & Performance (MVP)

MVP guidelines:

- Add indexes for:
  - foreign keys (`map_id`, `project_id`, etc.)
  - frequently queried fields (`created_at` for ordering, some search fields).
- Use simple composite indexes for common query patterns where needed.
- Periodically run `VACUUM` and `ANALYZE` (dev tooling, maintenance jobs later).

We are not optimizing for massive multi-tenant scale initially; we are optimizing for:

- correctness
- predictable performance on a modest dataset
- simplicity of understanding.

---

## 8. Future Directions

Future improvements may include:

- Central indexing / search across projects (separate index DB or search engine).
- Advanced history/versioning tables for sketches/maps.
- Event sourcing or change-log tables for audit trails.
- Sharding or separate DBs per customer/org (layer above project-level DB).

This document should be revisited whenever we make a **structural change** to how projects, maps, or major entities are persisted.
