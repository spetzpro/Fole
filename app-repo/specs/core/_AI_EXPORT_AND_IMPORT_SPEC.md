Version: 1.0.0  
Last-Updated: 2025-11-23  
Status: Authoritative Specification (SSOT)

# _AI_EXPORT_AND_IMPORT_SPEC.md  
Project, map, and server export/import behavior

This document defines how **data export and import** must work in FOLE, including:

- Project export/import  
- Map export/import  
- Server backup formats  
- Manifests & checksums  
- Version compatibility  
- Safety & permission rules  
- AI STOP conditions

Related specs (must be loaded when working on exports/imports):

- _AI_STORAGE_ARCHITECTURE.md  
- _AI_DB_AND_DATA_MODELS_SPEC.md  
- _AI_TEMPLATES_AND_DEFAULTS.md  
- _AI_ROLES_AND_PERMISSIONS.md  
- _AI_TESTING_AND_VERIFICATION_SPEC.md  

---

## 1. GOALS

Exports/imports must be:

1. **Portable** — self-contained, no hidden external dependencies.  
2. **Consistent** — created from atomic snapshots (no partial state).  
3. **Versioned** — must include schema + app version metadata.  
4. **Safe** — enforce permissions and destructive-change governance.  
5. **Deterministic** — reproducible directory and manifest structure.  
6. **Verifiable** — manifest + cryptographic checksums.  

---

## 2. EXPORT SCOPE TYPES

### 2.1 Project Export

Includes the full set of project-scoped data:


### 2.2 Map Export

Includes data for **one map**:

- map metadata  
- map DB  
- map-specific sketches  
- calibration metadata  

Map export MUST be importable into another compatible project.
- all project directories  
- all map DBs  
- all tiles and assets  

Server restore is a **destructive operation** and MUST follow destructive-change governance.

---

## 3. EXPORT FORMAT

### 3.1 Container Structure

Exports may be delivered as:

- A directory tree, or  
- A ZIP/TAR archive that preserves the same tree.

Example canonical structure (for a project export):

/export-root  
  export-manifest.json  
  metadata/  
    project.json  
  db/  
    project.sqlite  
    maps/  
      map-123.sqlite  
      map-456.sqlite  
  maps/  
    map-123/  
      tiles/...  
      thumbnails/...  
    map-456/  
      tiles/...  
  assets/  
    98a2f9a2/filename.png  
    c123bb8d/document.pdf  
  templates/  
    project-overrides.json  
    map-overrides.json  

### 3.2 Required Manifest File

Every export MUST include:

- `export-manifest.json` at the **root** of the export.

Mandatory top-level fields (conceptual):

- exportId (UUID)  
- exportType ("project" | "map" | "server")  
- createdAt (ISO 8601)  
- createdBy (user id / system id)  
- foleVersion (app version)  
- schemaVersion (DB schema version)  
- projectId (nullable for server exports)  
- mapIds (list, possibly empty)  
- includesAssets (boolean)  
- checksumAlgorithm (e.g. "sha256")  
- files: array of objects, each with:
  - relativePath (POSIX-style)  
  - checksum (e.g. sha256 hex string)  

Manifest rules:

- MUST list **every** exported file except the outer archive wrapper.  
- MUST use **relative paths** from export root.  
- MUST use a single checksumAlgorithm for all entries.  
- MUST reflect the final on-disk state after all writes and fsyncs.  

---

## 4. PROJECT EXPORT RULES

### 4.1 Required Contents

A canonical project export MUST include at least:

- `db/project.sqlite` (project-level DB; in the current MVP this is
  equivalent to the per-project `project.db` that contains `maps`,
  `map_calibrations`, `project_members`, and other project tables).  
- `db/maps/<mapId>.sqlite` for every map in the project (when map DBs are
  split out from the core project DB; for the current MVP, per-map DBs may
  still be modeled conceptually).  
- `maps/<mapId>/tiles/...`  
- `assets/...` (all project-owned assets)  
- `templates/project-overrides.json` (if any)  
- `templates/map-overrides.json` (if any)  
- `metadata/project.json` (core project metadata)

Additional optional directories:

- `automation/` – project automation definitions  
- `modules/` – per-module project configs  

### 4.2 Project Export Procedure (High-Level)

1. Acquire **DAL locks** on:
   - the project DB, and  
   - all map DBs for the project.  

2. For each locked DB:
   - perform WAL checkpoint as defined in _AI_STORAGE_ARCHITECTURE.md  
   - create a consistent copy (using online backup API if possible).  

3. Copy relevant file trees:
   - maps/*/tiles  
   - assets  
   - templates  
   - module-specific dirs  

4. Generate `export-manifest.json`:
   - list all files  
   - compute checksums according to configured algorithm  
   - embed version and schema info  

5. fsync the export root directory and all critical files.  

6. Release all locks.  

7. Optionally compress into a ZIP/TAR (without modifying internal paths).  

Exports MUST follow atomic snapshot rules and fsync ordering from _AI_STORAGE_ARCHITECTURE.md.

#### 4.3 Membership and Identity in Project Export/Import (MVP)

- `project_members` rows are included as part of the exported project DB
  (`db/project.sqlite` / `project.db`).
- Each membership row contains at least:
  - `project_id`
  - `user_id` (local identifier for the source server; corresponds to
    `CurrentUser.id` in this repo)
  - `role_id` (canonical/project role identifier such as `"OWNER"`,
    `"EDITOR"`, or `"VIEWER"`).
- In the current MVP:
  - `user_id` is treated as an opaque, source-local identifier.
  - On import, membership rows represent the **intended membership state** of
    the imported project, but they are **not automatically bound** to local
    user accounts.
  - The importer MUST preserve membership rows in the project DB but MAY
    surface them as "unbound" or "pending mapping" until a future mapping
    flow is implemented.
- Future phases MAY extend `project_members` with additional fields such as
  external user IDs, snapshot display names, audit timestamps, and explicit
  import/export mapping helpers. Those are out of scope for the current MVP.

#### 4.4 Imported Membership Rows and Unmapped Members (MVP Behavior)

This section describes how **imported membership rows** behave on the target
server today, and introduces the concept of **unmapped imported members**.

- On export:
  - Each `project_members` row is written into the project DB with:
    - `project_id`
    - `user_id` (source-local identifier corresponding to `CurrentUser.id` on
      the exporting server)
    - `role_id` (canonical/project role identifier such as `"OWNER"`,
      `"EDITOR"`, or `"VIEWER"`).
  - The exporting system treats `user_id` as an **opaque, source-local
    identifier**; no attempt is made to normalize or globalize user identity
    at export time.

- On import (MVP behavior):
  - All `project_members` rows from the bundle are preserved in the target
    project DB **unchanged**.
  - These rows represent the **intended membership** as it existed on the
    source server at the time of export.
  - The import process does **not** automatically:
    - Create matching local users in `core.auth`.
    - Bind imported `user_id` values to existing local users.
    - Modify or filter imported membership rows based on the target server’s
      user directory.

- Definition: **unmapped imported member**
  - An imported membership row is considered *unmapped* on the target server
    if its `user_id` does **not** correspond to any known local user
    according to the identity model described in `core.auth`
    (`CurrentUser.id`, roles, etc.).
  - In the current MVP implementation:
    - The system has no additional identity fields (such as external IDs or
      identity provider subjects) on `project_members`.
    - The importer must therefore assume that all imported `user_id` values
      are **unmapped** until a dedicated mapping layer is introduced.

- Permission evaluation implications (MVP):
  - `ProjectMembershipService` and membership-aware permission flows on the
    target server continue to use `project_members` as the canonical source
    of project membership.
  - For a given request, membership checks are only meaningful when **both**:
    - There is a local user whose `CurrentUser.id` matches the imported
      `user_id` in some `project_members` row for that project.
    - That row grants a role/permission set sufficient for the requested
      action.
  - All other imported membership rows are effectively **inactive / unbound
    membership hints**: they express the *intended* membership but have no
    effect on permission checks until mapping occurs.

- Future work (not implemented in this slice):
  - Extending `project_members` with richer identity fields
    (e.g. external identity keys, provider type + subject, display name
    snapshots, timestamps, import-origin metadata).
  - Introducing explicit mapping tools (UX + APIs) that allow admins to:
    - Map imported membership entries to existing local users.
    - Create new local users for imported membership entries.
    - Decide what to do with conflicting or obsolete identities.
  - These capabilities are documented as **future phases** and are *not*
    part of the current MVP runtime.

### Future Membership Mapping Flow (Non-MVP, Forward-Looking)

> **FUTURE PHASE / NOT IMPLEMENTED:** This section sketches a future flow
> for mapping imported membership rows to local users. It is **not** a
> commitment for the current release.

After a project import, the system will be able to identify **unmapped
imported members** based on `project_members` rows and the current user
directory (as exposed by `core.auth`). A future admin workflow (via UI and/or
APIs) is expected to:

1. **List unmapped imported memberships for a project**
   - For each `project_members` row whose `user_id` (and, later,
     `user_external_id`) does not match a known local user, show:
     - `display_name_snapshot` (if present).
     - `user_external_id` (if present).
     - `role_id`.
     - Basic import-origin metadata (e.g. source server id, original
       `user_id`) when available.

2. **Allow admins to resolve each unmapped entry**
   - For every unmapped row, the workflow may offer actions such as:
     - **Map to existing local user** — select a user from the local
       directory and bind the membership to that identity.
     - **Create new local user** — provision a new local user account and
       associate the imported membership with it.
     - **Remove or deactivate membership** — discard the imported row if it
       should not grant access on the target server.

3. **Persist mapping decisions back into project_members**
   - After a mapping action is chosen, the system updates
     `project_members` and related fields to reflect the local binding:
     - Update `user_id` and/or `user_external_id` to reference the chosen
       local user.
     - Preserve import-origin fields for auditability.
   - From that point on, membership-aware permission checks behave as if the
     membership were created locally on the target server.

This flow deliberately separates **data preservation** (MVP, already
implemented) from **identity reconciliation** (future). The importer always
preserves `project_members` rows as-is; only explicit admin actions in a
future phase will change how those rows are bound to local users.

#### 4.5 Imported Roles and Unmapped Role IDs (Future Design)

> **FUTURE PHASE / NOT IMPLEMENTED:** This section describes how imported
> role identifiers should eventually be reconciled with the target
> server’s role configuration.

- On export:
  - `project_members.role_id` values are written into `project.db` as-is,
    reflecting the roles present on the source server for that project.

- On import (conceptual future behavior):
  - The target server may have a different role catalog and project role
    configuration.
  - An imported `role_id` may not exist in the target project’s role
    configuration or in any global role template.

- Definition: **unmapped imported role**
  - A `role_id` value found in imported `project_members` rows that does
    not correspond to any known role in the target project’s role
    configuration (or global role templates).
  - Such roles are preserved in the data but do not have a well-defined
    permission set on the target server until they are mapped or resolved.

- Future Role Mapping Flow (high-level):
  1. After import, the system detects which `role_id` values from
     `project_members` are not present in the target project’s role config.
  2. An admin-facing workflow (UI/API) allows resolving each imported
     `role_id` by:
     - Mapping it to an existing local role (e.g. mapping
       `"FieldEngineerSource"` to `"FIELD_ENGINEER"`).
     - Importing it as a new project-specific role, optionally seeding its
       permission set from the source export or from a template.
     - Marking it as ignored/fallback, in which case users with that role
       may be demoted to a fallback such as `"VIEWER"`.
  3. Once resolved, the project’s role configuration is updated so that all
     `project_members.role_id` values reference known roles with concrete
     permission sets.

- Current MVP behavior:
  - The runtime today uses `role_id` primarily via
    `CANONICAL_ROLE_PERMISSIONS`, with a small set of canonical roles.
  - Non-canonical `role_id` values are not fully modeled; implementations
    may treat them as a default role (e.g. `"VIEWER"`) or reject them,
    depending on how `deriveProjectMembershipForUser` is used.
  - No automatic role-mapping logic exists yet; this section documents the
    intended direction for future import tooling.

---

## 5. MAP EXPORT RULES

Map export is a **scoped** variant of project export.

Required contents for a single map `<mapId>`:

- `db/maps/<mapId>.sqlite`  
- `maps/<mapId>/tiles/...`  
- `maps/<mapId>/thumbnails/...` (if present)  
- map-specific calibration + metadata (e.g. in `metadata/maps/<mapId>.json`)  
- sketches that are **attached to this map** (if stored map-locally or via filtered DB export)  

The manifest:

- `exportType = "map"`  
- `mapIds = [ "<mapId>" ]`  
- `projectId` may be included to indicate original project context.

Importing maps into a new project MUST:

- resolve ID conflicts (old mapId vs project’s existing maps),  
- record remapping in an **import report**,  
- and be governed by project-level permission rules.

---

## 6. SERVER EXPORT / BACKUP RULES

A server export is a **full STORAGE_ROOT backup**:

- Must include:
  - `core/core.db`  
  - `modules/projects/...` with their DBs and files  
  - `templates/...`  
  - any other runtime data defined in _AI_STORAGE_ARCHITECTURE.md  

- Must include a **top-level manifest** that describes:
  - storage layout version  
  - list of projects  
  - list of maps  
  - DB file checksums  
  - optional log references  

Permissions:

- Only **SysAdmin** can trigger a server export.  

Restore (import) of a server export is a **destructive action** and MUST:

- require destructive-change.json,  
- require at least two human approvals,  
- follow the atomic restore protocol in _AI_STORAGE_ARCHITECTURE.md.  

---

## 7. IMPORT RULES (GENERAL)

### 7.1 Import Phases

All imports follow the same high-level phases:

1. **Validation**  
   - Check that `export-manifest.json` exists.  
   - Validate manifest structure (JSON schema).  
   - Validate `exportType`.  
   - Check `foleVersion` and `schemaVersion` against current server.  

2. **Checksum Verification**  
   - For every file listed in `files[]`, recompute checksum.  
   - If any mismatch occurs → **reject import** and STOP.  

3. **Permission Check**  
   - Project/map import: must satisfy project-level permissions.  
   - Server import: SysAdmin-only + destructive-change.json.  

4. **ID Conflict Analysis**  
   - Check if projectId/mapIds already exist.  
   - Propose plan: new IDs vs overwrite (requires explicit user intent).  

5. **Plan Confirmation**  
   - Show a summary of:
     - what will be created,  
     - what might be overwritten,  
     - any migrations required.  
   - Require human confirmation, especially for destructive paths.  

6. **Execution**  
   - Use DAL operations only.  
   - Apply DB migrations if needed and available.  
   - Copy file trees using atomic protocols.  

7. **Reporting**  
   - Generate import report:
     - original IDs to new IDs mapping  
     - errors/warnings  
     - skipped elements (if any)  

### 7.2 ID Conflict Handling

If the target server already contains:

- the same `projectId`, or  
- any of the same `mapIds`  

the import must choose a strategy:

**Safe Default:**

- create new IDs (e.g., new projectId, new mapIds),  
- record mapping in import report,  
- DO NOT delete or overwrite anything.

**Destructive Overwrite (optional):**

- Only allowed when:
  - user explicitly chooses “overwrite”, and  
  - destructive-change.json is provided (for project or server imports), and  
  - at least two human approvals are recorded.

AI MUST NEVER choose overwrite by itself.

### 7.3 Partial Import Failures

If any failure occurs after some changes:

- DB operations should be within transactions and rolled back where possible.  
- If partial state cannot be avoided:
  - mark affected objects as “import-incomplete” or similar flag,  
  - surface clear warnings to the user,  
  - AI MUST NOT attempt direct DB surgery.  

---

## 8. PERMISSIONS & SECURITY

### 8.1 Export Permissions

- Project export:
  - allowed for ProjectOwner, ProjectAdmin, SysAdmin.  
- Map export:
  - same as project export, but scoped to a specific project.  
- Server export:
  - SysAdmin only.  

### 8.2 Import Permissions

- Project import:
  - target project context requires Owner/Admin/SysAdmin.  
  - new project creation: ProjectOwner or SysAdmin.  
- Map import:
  - project Owner/Admin/SysAdmin for target project.  
- Server import:
  - SysAdmin only, plus destructive-change.json compliance.

AI MUST always evaluate permissions via `_AI_ROLES_AND_PERMISSIONS.md` and MUST NOT bypass these rules.

---

## 9. VERSIONING & MIGRATIONS

### 9.1 Manifest Version Fields

Every `export-manifest.json` MUST contain:

- `foleVersion` – the application version that produced the export.  
- `schemaVersion` – the DB schema version at the time of export.

### 9.2 Compatibility Rules

- If `schemaVersion` is **less** than current:
  - import MAY run migration scripts if they exist and are approved.  
- If `schemaVersion` is **equal**:
  - import is allowed, assuming no other blocking issues.  
- If `schemaVersion` is **greater**:
  - import MUST be rejected, or a human must explicitly acknowledge a workaround pathway; AI MUST NOT auto-migrate “forward”.  

### 9.3 AI STOP Triggers for Versioning

AI MUST STOP and ask for human guidance if:

- schemaVersion mismatch exists and no migration path is defined,  
- export indicates features/modules not present on target server,  
- template defaults referenced by the export are missing on server.

---

## 10. CHECKSUMS

### 10.1 Algorithm

- Canonical checksum algorithm: **SHA-256**.  
- If another algorithm is used, it MUST be documented and explicitly whitelisted.

### 10.2 Coverage

- All DB files (project, map, core in server export).  
- All assets and tiles.  
- All templates and config files.  

Import behaviour:

- If any checksum fails:
  - **reject import**,  
  - log the failure,  
  - AI MUST STOP and must not attempt to “fix” or ignore mismatches.  

---

## 11. TESTING REQUIREMENTS

From `_AI_TESTING_AND_VERIFICATION_SPEC.md`, exports/imports MUST have tests for:

- **Round-trip**: export → import → re-export and compare manifests.  
- **Checksum correctness**: tampered file detection.  
- **Manifest completeness**: no missing files compared to STORAGE_ROOT snapshot.  
- **ID remapping correctness**: new IDs map consistently.  
- **Version conflict handling**: correct errors and STOP behavior.  
- **Map-only flows**: per-map export/import, including cross-project cases.  
- **Server backup/restore**: at least one full DR (disaster recovery) scenario.  

AI agents generating or modifying export/import code MUST also generate/update tests accordingly.

---

## 12. LOGGING & AUDIT

Each export or import operation MUST produce an audit entry containing:

- operation type ("projectExport", "mapImport", "serverBackup", etc.)  
- who initiated it (user id or system)  
- time started and completed  
- target and/or source projectId/mapIds  
- total file count and size  
- checksum status (passed/failed)  
- version info (foleVersion, schemaVersion)  
- any ID remapping details  
- error or warning messages  

Audit logs:

- MUST be **append-only**.  
- MUST be included in server exports.  
- MUST be queryable by SysAdmin and, where appropriate, by project admins for their own projects.

---

## 13. AI RULES & STOP CONDITIONS

### 13.1 AI MUST

- Load this spec before proposing or modifying export/import logic.  
- Use the manifest format defined here.  
- Always compute and validate checksums.  
- Always perform permission checks via the roles spec.  
- Present users with a clear summary of:
  - scope (project/map/server),  
  - size,  
  - potential destructive effects,  
  - version compatibilities.  

### 13.2 AI MUST NOT

- Perform an export or import without explicit user instruction.  
- Automatically choose destructive overwrite strategies.  
- Skip checksum validation.  
- Directly edit DB files; must use DAL and storage APIs.  
- Invent missing files or silently ignore missing manifest entries.  

### 13.3 AI MUST STOP IF

- `export-manifest.json` missing or invalid.  
- Any checksum mismatch occurs.  
- Version or schema compatibility is unclear or conflicting.  
- ID conflict resolution strategy is not explicitly defined by the user.  
- The required permissions are not clearly satisfied.  
- A destructive operation is requested without destructive-change.json.  

STOP = DO NOT PROCEED; ask the user for clarification or human review.

---

End of document  
_AI_EXPORT_AND_IMPORT_SPEC.md  
This document is authoritative. All agents and backend systems MUST follow it exactly.
