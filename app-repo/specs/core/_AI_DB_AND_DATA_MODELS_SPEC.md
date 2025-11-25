# _AI_DB_AND_DATA_MODELS_SPEC.md  
Version: 1.0.0  
Last Updated: 2025-11-23  
Status: Authoritative Specification (SSOT)

# DB & DATA MODELS SPECIFICATION

This document defines the **database layer**, **data modeling conventions**, and **migration rules** for FOLE.

It is binding for:

- All backend services  
- All AI agents generating schema / queries / migrations  
- All modules that store persistent data  

This spec works together with:

- `_AI_STORAGE_ARCHITECTURE.md` (file layout, STORAGE_ROOT, atomic writes)  
- `_AI_ROLES_AND_PERMISSIONS.md` (auth, ACLs)  
- `_AI_MODULE_SYSTEM_SPEC.md` (module boundaries)  
- `_AI_AUTOMATION_ENGINE_SPEC.md` (migrations & jobs)  

If this document conflicts with code → **this spec wins** and code must be corrected.

---

## 1. HIGH-LEVEL ARCHITECTURE

### 1.1 Engines

The platform supports:

- **SQLite** (default, embedded, one file per DB)
- **PostgreSQL (with optional PostGIS)** as an *external* engine

Rules:

1. All data access must go through the **Data Access Layer (DAL)**.  
2. DAL must present a **stable logical schema**, independent of physical engine.  
3. AI MUST NOT generate code that talks directly to SQLite/Postgres without going through DAL interfaces.

### 1.2 DB Types

We have three main logical DBs:

1. **Core DB** – `core.db` (or equivalent core schema in Postgres)  
2. **Project DB** – one per project  
3. **Map DB** – one per map (for heavy map-specific data such as tile indices or per-map caches)

Minimal set:

- Core DB is mandatory  
- Project DB per project is mandatory  
- Map DB is optional, only used when needed by map subsystem

Engine-specific mapping is described in Section 3.

### 1.3 DAL Helper Conventions

The DAL exposes low-level `executeCommand` / `executeQuery` operations on `DbConnection` for engine-agnostic access.

To keep calling code consistent and avoid ad-hoc SQL wrappers, higher-level code SHOULD prefer the following helpers (implemented in `src/core/db/DbHelpers.ts`):

- `executeWrite(conn, text, parameters?)` → executes a write/command and returns a `DbCommandResult`.
- `executeReadOne(conn, text, parameters?)` → executes a read query and returns the first row or `undefined`.
- `executeReadMany(conn, text, parameters?)` → executes a read query and returns all rows as an array.

These helpers are engine-agnostic and MUST NOT bypass any future transaction or permission checks layered on top of the DAL. They are intended as a thin, shared convenience layer, not a replacement for module-specific repositories or services.

---

## 2. RESPONSIBILITY SPLIT (CORE vs PROJECT vs MAP)

### 2.1 Core DB – Global Scope

The core DB stores:

- Users & identities  
- Global roles and permissions  
- Server settings & feature flags  
- Module enablement (global)  
- Templates/index of templates (not the template files themselves)  
- Automation definitions & logs (global-level metadata)  
- Project registry (IDs, names, status, and pointers to project roots / DBs)  
- Global audit log index (high-level references; detailed logs may live per project)

### 2.2 Project DB – Per-Project Scope

Each project DB stores:

- Project-specific roles & role assignments  
- Project settings & metadata  
- Project collections/categories  
- Map registry for that project (map metadata, types, state, calibration status flags)  
- Sketch registry and sketch versions (for that project)  
- Project-local templates & overrides  
- Project-local automation and job history  
- Project-local audit log details  
- Any module data that is conceptually “owned” by this project

### 2.3 Map DB – Per-Map Scope

Each map DB stores:

- Map-specific derived data  
- Tile index & tile metadata  
- Optional performance caches (e.g., precomputed layers)  
- Map-level analytics or statistics  
- Map-local settings cache (non-authoritative, derived from project-level definitions)  

**Rule:** business-critical entities (sketches, cabinets, tasks, etc.) **must not live only in map DBs**; they belong in project DB and may link to map DBs.

Map-local settings MUST be treated as a **logical cache** of higher-level configuration, not as the only source of truth. Any authoritative, user-facing configuration that controls behavior across maps or projects MUST have a representation in the project DB or core DB.

---

## 3. PHYSICAL LAYOUT PER ENGINE

### 3.1 SQLite (Default, Local)

- Core DB:  
  - `STORAGE_ROOT/core/core.db`

- Project DB:  
  - `STORAGE_ROOT/modules/projects/<projectId>/project.db`

- Map DB:  
  - `STORAGE_ROOT/modules/projects/<projectId>/maps/<mapId>/map.db`

SQLite Rules:

1. `journal_mode = WAL` by default (see `_AI_STORAGE_ARCHITECTURE.md`).  
2. DAL must mediate all write access; no concurrent direct writers.  
3. Foreign keys: `PRAGMA foreign_keys = ON;` is required.  
4. AI must not change PRAGMAs without updating `_AI_STORAGE_ARCHITECTURE.md`.

### 3.2 PostgreSQL / PostGIS (Remote)

When using Postgres:

- Core schema: `fole_core`  
- Project schema: `fole_project_<projectUuid>` (or hashed variant)  
- Map schema: `fole_project_<projectUuid>_map_<mapUuid>` (optional)

Rules:

1. DAL must abstract schema names behind configuration.  
2. Migration tooling must support both SQLite and Postgres.  
3. PostGIS types only used where explicitly required by geo spec (`_AI_GEO_AND_CALIBRATION_SPEC.md`).

---

## 4. GENERAL MODELING CONVENTIONS

### 4.1 Primary Keys

All tables MUST use:

- Column `id` as PRIMARY KEY
- Type:
  - SQLite: TEXT (UUID v4 as canonical format)
  - Postgres: `uuid`

No integer autoincrement IDs for public entities.

### 4.2 Timestamps

Standard columns:

- `created_at` – UTC, ISO8601  
- `updated_at` – UTC, updated on change  
- `deleted_at` – nullable; when set, row considered soft-deleted  

In SQLite: TEXT, ISO8601  
In Postgres: `timestamptz`

### 4.3 Soft Delete vs Hard Delete

Default: **soft delete** via `deleted_at`.

Hard deletes allowed only for:

- temp/derived data  
- caches  
- tiles  
- job logs older than retention period  

AI must not convert soft-deleted tables to hard deletes without spec change + human approval.

### 4.4 Foreign Keys

Rules:

1. All strong relationships must have foreign key constraints.  
2. `ON DELETE` behavior must be explicit:  
   - `RESTRICT` for critical entities  
   - `SET NULL` when optional link  
   - `CASCADE` only with clear business justification  

3. AI must not add cascade deletes casually; they are considered **dangerous** and require a destructive-change proposal.

### 4.5 JSON Columns

Allowed for:

- Flexible property bags  
- Module-specific settings  
- Extra metadata fields

Conventions:

- Column suffix `_json` for JSON blobs.  
- Schema must specify expected shape if used heavily.  
- Critical data should be normalized, not stored only as JSON.

---

## 5. CORE ENTITIES (ABSTRACT)

This section defines **logical** entities. Physical schemas may differ, but DAL must implement these fields and constraints.

### 5.1 User

Minimal fields:

- `id` (uuid)  
- `username`  
- `display_name`  
- `email` (optional)  
- `created_at`, `updated_at`  
- `is_active`  

Relations:

- system roles (many-to-many via `user_system_roles`)  
- project roles (via project-role assignment table)

### 5.2 Project

Minimal fields:

- `id` (uuid)  
- `name`  
- `slug` (unique)  
- `category` (see templates)  
- `status` (active/archived/deleted)  
- `created_at`, `updated_at`, `deleted_at`  

Relations:

- owner (user id)  
- default CRS / celestial body (see geo spec)

### 5.3 Map

Minimal fields:

- `id` (uuid)  
- `project_id`  
- `name`  
- `type` (floorplan, terrain, globe, …)  
- `calibration_status` (uncalibrated / calibrated / deprecated)  
- `created_at`, `updated_at`, `deleted_at`  

Optional fields:

- `source_file_id`  
- `resolution_mm_per_pixel`  
- `crs` or geo anchor reference

### 5.4 Sketch

Logical fields (in project DB):

- `id`  
- `project_id`  
- `feature_id` (sketch feature type)  
- `name`  
- `owner_id`  
- `created_at`, `updated_at`, `deleted_at`  

Version table:

- `sketch_version` with:  
  - `id`  
  - `sketch_id`  
  - `version_index` (integer)  
  - `geometry_data_json` (or compressed representation)  
  - `created_at`  
  - `created_by`  

Rules:

- Only latest version considered “active” for normal view.  
- History kept in version table; pruning/purging rules will be defined later.  

### 5.5 Automation Job

Stored in core DB or project DB depending on scope.

Fields (abstract):

- `id`  
- `scope` (core/project)  
- `project_id` (nullable)  
- `type`  
- `state` (see `_AI_AUTOMATION_ENGINE_SPEC.md`)  
- `created_by`  
- `created_at`, `updated_at`  
- `payload_json`  
- `result_json` (nullable)  

---

## 6. INITIAL LOGICAL TABLE SCHEMAS (PHASE 1)

This section captures initial, engine-agnostic logical schemas for a minimal usable core. They do **not** mandate physical DDL yet; migrations and concrete DDL must be derived from these shapes.

### 6.1 Core DB – `users`

Table: `users` (core DB)

- `id` (uuid, PK)
- `username` (text, unique)
- `display_name` (text)
- `email` (text, nullable, unique when not null)
- `is_active` (bool, default true)
- `created_at` (timestamp)
- `updated_at` (timestamp)
- `deleted_at` (timestamp, nullable)

Constraints:

- `users_username_unique`
- `users_email_unique_where_not_null` (Postgres partial index; in SQLite, enforced via app logic and checks)

### 6.2 Core DB – `projects`

Table: `projects` (core DB)

- `id` (uuid, PK)
- `slug` (text, unique)
- `name` (text)
- `category` (text)
- `status` (text; enum-like: `active`, `archived`, `deleted`)
- `owner_user_id` (uuid FK → `users.id`)
- `created_at` (timestamp)
- `updated_at` (timestamp)
- `deleted_at` (timestamp, nullable)

Constraints:

- `projects_slug_unique`
- FK `projects_owner_user_id_fkey` → `users(id)`

### 6.3 Project DB – `maps`

Table: `maps` (project DB)

- `id` (uuid, PK)
- `project_id` (uuid, FK → core `projects.id` or project-local mirror, per engine strategy)
- `name` (text)
- `type` (text; enum-like: `floorplan`, `terrain`, `globe`, ...)
- `calibration_status` (text; enum-like: `uncalibrated`, `calibrated`, `deprecated`)
- `source_file_id` (uuid, nullable)
- `resolution_mm_per_pixel` (numeric, nullable)
- `crs` (text, nullable)
- `created_at` (timestamp)
- `updated_at` (timestamp)
- `deleted_at` (timestamp, nullable)

Constraints:

- FK `maps_project_id_fkey` → `projects(id)` according to engine-specific mapping rules.

These tables are the **starting point** for migrations; additional tables and columns will be added as other specs (auth, roles, geo, modules) come online.

---
## 7. NAMING & SCHEMA CONVENTIONS

### 6.1 Table Names

- snake_case  
- plural nouns for tables: `projects`, `maps`, `sketches`  
- join tables: `<left>_<right>` e.g. `user_system_roles`  

### 6.2 Column Names

- snake_case  
- foreign keys end with `_id`  
- booleans start with `is_` or `has_`  

### 6.3 Indices

Rules:

1. Every FK should have an index on the FK column.  
2. Unique constraints must be explicit (e.g., `projects.slug` unique).  
3. Index names must be deterministic and based on table/column names.  
4. AI must not create “just in case” indexes; only when justified by spec or ticket.

---

## 8. MIGRATIONS

Migrations are **versioned**, **reversible** operations on the logical schema.

### 7.1 Migration Files

Per engine / schema, stored under:

- `app-repo/specs/core/migrations/` for global  
- `app-repo/specs/modules/<moduleName>/migrations/` for module-specific  

Each migration:

- has an ID (timestamp or sequence)  
- has up/down steps  
- declares affected tables  
- declares whether **destructive** or **non-destructive**  

### 7.2 Destructive vs Non-Destructive

Non-destructive:
- add column (nullable or with default)  
- create new table  
- add index  

Destructive:
- drop table  
- drop column  
- change type in incompatible way  
- change semantics of existing data  

Destructive migrations require:

- `destructive-change.json`  
- two-human approval  
- rollback plan  
- adherence to `_AI_AUTOMATION_ENGINE_SPEC.md`  

### 7.3 Migration Order & Safety

Rules:

1. Apply migrations in strict ID order.  
2. All migrations must be **idempotent** when re-run on an already migrated schema (no-op).  
3. Migrations must support both SQLite and Postgres or be clearly marked engine-specific with guards.  
4. AI must not generate migrations that rely on manual ad-hoc SQL outside DAL.

---

## 9. DB ACCESS PATTERNS (DAL RULES)

All data access must:

1. Go through well-defined DAL methods.  
2. Never embed raw connection strings in code.  
3. Use transactions for multi-step operations that must be atomic.  
4. Maintain invariants from this spec (FKs, soft delete, etc.).

DAL must expose:

- CRUD helpers  
- Query builders or repository layer  
- Paginated list APIs  
- Audit logging hooks  
- Permission enforcement hooks  

AI must not bypass DAL even if “simpler” for a one-off.

---

## 10. AUDIT & LOG TABLES

### 9.1 Audit Log (Abstract)

Each significant action must log:

- `id`  
- `actor_user_id` (nullable for system)  
- `project_id` (nullable)  
- `resource_type`  
- `resource_id`  
- `operation` (create/update/delete/migration/etc.)  
- `meta_json` (details)  
- `created_at`  

Rules:

- Audit tables must be append-only.  
- No hard delete; pruning via archival only.  

### 9.2 Log Retention

- Operational logs older than X days may be moved to archive or external system.  
- Audit logs for security/trace must have longer retention configured.  
- Exact policies may be configured but must never silently remove audit entries.

---

## 11. AI RULES & STOP CONDITIONS

AI agents **must**:

1. Load this spec before proposing or editing schema.  
2. Use DAL abstractions, not direct raw SQL (except within clearly marked migration context).  
3. Mark migrations as destructive/non-destructive correctly.  
4. Cross-check with:  
   - `_AI_STORAGE_ARCHITECTURE.md` for DB files & atomicity  
   - `_AI_ROLES_AND_PERMISSIONS.md` for permission-related tables  
   - `_AI_GEO_AND_CALIBRATION_SPEC.md` for geo-related tables  

AI agents **must STOP** and ask a human when:

- Unsure whether data should belong to core vs project vs map DB.  
- Unsure whether an operation is destructive.  
- A change affects permissions, roles, or auth-critical tables.  
- A migration cannot be made reversible.  
- There is a conflict between existing schema and this spec.  

Forbidden for AI:

- Dropping tables/columns without human-approved destructive-change.json.  
- Removing soft delete and converting to hard delete without spec update.  
- Changing primary keys or ID formats.  
- Introducing engine-specific features that break portability without explicit approval (e.g., Postgres-only extensions in core schema).

---

## 12. RELATION TO OTHER SPECS

- Storage layout and DB file behavior: `_AI_STORAGE_ARCHITECTURE.md`  
- Roles & permissions: `_AI_ROLES_AND_PERMISSIONS.md`  
- Geo extensions: `_AI_GEO_AND_CALIBRATION_SPEC.md`  
- Modules: `_AI_MODULE_SYSTEM_SPEC.md`  
- Automation & migrations: `_AI_AUTOMATION_ENGINE_SPEC.md`  

In case of conflict:

1. `_AI_MASTER_RULES.md`  
2. `_AI_STORAGE_ARCHITECTURE.md`  
3. `_AI_ROLES_AND_PERMISSIONS.md`  
4. This DB spec  

---

End of document  
`_AI_DB_AND_DATA_MODELS_SPEC.md`  
All agents and backend services MUST follow this specification exactly.
