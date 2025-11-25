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

## 3. Core Entities (Conceptual)

Exact schemas will live alongside migrations, but conceptually each project DB will handle:

- `project_metadata`
  - one row per project (or a small metadata table)
  - may be mirrored in `project.json` for quick file-based introspection
- `maps`
  - each floorplan / base image
  - fields like: `id`, `name`, `file_id`, `width`, `height`, `created_at`, etc.
- `sketch_layers`
  - sketch overlays linked to a map
  - fields like: `id`, `map_id`, `data_blob` (vector data, possibly as JSON or binary), etc.
- `files`
  - metadata about uploaded files
  - fields like: `id`, `original_name`, `mime_type`, `size`, `created_at`, etc.
- `comments`
  - comments linked to a project / map / sketch / file
  - fields like: `id`, `project_id`, `anchor_type`, `anchor_id`, `body`, `created_at`, `created_by`, etc.
- `calibration`
  - calibration sets for maps, tying pixel coordinates to world coordinates
- `permissions` / `sharing`
  - future tables for per-project role assignments
  - may be local or partly derived from central auth/permissions.

Not all of these need to be present in MVP; the schema can grow over time.

---

## 4. DAL Context and Access Patterns

The Data Access Layer is shaped by:

- `core.storage.DalContextFactory`
  - which returns a context object (DalContext) that wraps the underlying DB access.
- The DAL should expose:
  - generic methods (`run`, `all`, etc.) or
  - higher-level repository-style functions (in feature modules).

General principles:

- DAL methods should return `Result<T, AppError>` or throw only when truly exceptional, depending on the abstraction layer.
- SQL queries should be:
  - parameterized (no string interpolation with user data)
  - kept small and explicit
- Avoid burying massive amounts of logic in SQL; keep it at the TypeScript layer whenever possible.

---

## 5. Migrations

Schema evolution is managed by:

- `core.storage.MigrationRunner`.

Responsibilities:

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
- Surfaces a clear `AppError` describing the failure, while logging full details via Logger/Diagnostics.

---

## 6. Relationship to TypeScript Models

`ProjectModel.md` and other module specs define the TS-level models used in code.

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
