# _AI_STORAGE_ARCHITECTURE.md
Document-Version: 1.1.0  
Last-Updated: 2025-11-23T00:00:00Z

# AI STORAGE ARCHITECTURE SPEC  
Authoritative specification for all storage behavior, rules, atomicity guarantees, DB handling, and AI constraints.

---

# 1. PURPOSE
This file defines:
- How all storage is structured.
- How files, database operations, manifests, and atomic writes must occur.
- What AI agents are allowed to do, forbidden to do, and required to do in storage-related tasks.
- Required safety patterns to prevent corruption, partial writes, or invalid migrations.

This document is binding.  
If any behavior or code conflicts with this file → the spec wins.

---

# 2. STORAGE_ROOT STRUCTURE

All runtime and persistent data exist under a single root directory named:

```
STORAGE_ROOT/
```

It must live on a **single filesystem** (to guarantee atomic rename).

## 2.1 Directory Structure (Authoritative)
```
STORAGE_ROOT/
├── core/
│   └── core.db
│
├── projects/
│   └── <projectUUID>/
│       ├── config.json
│       ├── project.db
│       ├── assets/
│       ├── maps/
│       │   └── <mapUUID>/
│       │       ├── map.db
│       │       ├── tiles/
│       │       ├── files/
│       │       └── tmp/
│       ├── files/
│       └── tmp/
│
└── tmp/ (global tmp)
```

## 2.2 Required Characteristics
- **All tmp directories MUST be subdirectories of their corresponding target directories**.  
  This guarantees atomic rename via same-filesystem constraints.
- `core.db` MUST exist only under `core/`.
- `project.db` MUST exist only under `<project>/`.
- `map.db` MUST exist only under `<map>/`.

---

# 3. DATABASE RULES

All databases use SQLite with **mandatory** settings:

## 3.1 SQLite Defaults
```
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
```

## 3.2 Allowed Variants
- `synchronous = FULL` allowed only in production or critical workflows requiring power-loss durability.
- DB tuning MUST be documented in `_AI_STORAGE_ARCHITECTURE.md` if changed.

## 3.3 Concurrency
- SQLite supports **multiple readers, one writer**.
- The DAL (Data Access Layer) MUST provide:
  - Advisory write locks
  - Safe retry semantics
  - Safe WAL checkpoint procedures

---

# 4. LOCKING & ACCESS

## 4.1 Advisory Lock Types
- `read_lock` — shared, unlimited.
- `write_lock` — exclusive, one writer at a time.

## 4.2 DAL Guarantees
- No direct SQLite writes outside the DAL.
- No AI agent may bypass the DAL.
- Locks MUST cover both file + DB operations during atomic sequences.

---

# 5. MANIFEST SYSTEM (REQUIRED)

Every atomic file operation MUST correspond to a row in the manifest table.

## 5.1 Manifest Schema (Authoritative)
```
manifest:
  id INTEGER PRIMARY KEY
  op_type TEXT            -- e.g., "tile_write", "map_import", "attachment_add"
  target_path TEXT        -- final target path
  tmp_path TEXT           -- tmp write directory
  expected_files JSON     -- [{ relative_path, sha256 }]
  created_at TEXT
  state TEXT CHECK (state IN ("pending","committed","aborted"))
  committed_at TEXT
  author TEXT
  commit_txid INTEGER
```

## 5.2 State Transitions
- `pending` → initial
- `committed` → after DB COMMIT completes
- `aborted` → cleanup or failed op

State transitions MUST occur in a DB transaction.

## 5.3 Orphan Tmp Cleanup
- Only delete `tmp_*` directories **older than 1 hour**.
- MUST verify manifest state is not `pending` first.

---

# 6. ATOMIC WRITE PROTOCOL (MANDATORY)

This is the **only accepted sequence** for safe file+DB write operations.

## 6.1 REQUIRED SEQUENCE

1. Acquire **write lock** (DAL controls this).
2. Create `target/tmp/<uuid>/`.
3. Write all files into tmp.
4. **fsync every file**.
5. **fsync the tmp directory**.
6. Atomic rename: `rename(tmp → final)`  
   This requires same-filesystem constraints.
7. **fsync the parent directory**.
8. Update manifest row inside DB transaction.
9. `COMMIT` with durable sync.
10. Release lock.

AI agents MUST use this sequence.  
Human code MUST use this sequence.  
Nothing else is allowed.

---

# 7. PORTABILITY RULES

## 7.1 Project Portability
A project is portable if:

```
copy STORAGE_ROOT/projects/<projectUUID>/
```

This MUST be sufficient to transfer the project between servers.

## 7.2 Map Portability
Same rule:

```
copy STORAGE_ROOT/projects/<projectUUID>/maps/<mapUUID>/
```

All paths, schemas, manifests, tiles, files must remain valid.

## 7.3 Project and Map Snapshots (Atomic Writes)

Both project-level and map-level snapshot/metadata operations MUST use the atomic write protocol defined in section 6:

- **Project metadata snapshots** write to paths of the form:
  - `/projects/<projectUUID>/metadata.json`
  - These operations MUST insert a manifest row with `op_type` such as `"project_metadata_write"`, `target_path` set to the final metadata path, and `tmp_path` under the corresponding project `tmp/` directory.

- **Map-level snapshots** write to paths of the form:
  - `/projects/<projectUUID>/maps/<mapUUID>/snapshot.json`
  - These operations MUST insert a manifest row with `op_type` such as `"map_snapshot_write"`, `target_path` set to the final snapshot path, and `tmp_path` under the corresponding project or map `tmp/` directory on the same filesystem.

In both cases, the DAL-backed write lock MUST cover the entire atomic sequence (files, fsyncs, rename, and manifest update), and the manifest state MUST transition from `pending` → `committed` only after the DB transaction successfully commits.

---

# 8. BACKUP AND RESTORE

## 8.1 SQLite Official Backup Procedure
Backups MUST follow:

1. Acquire write lock.
2. `PRAGMA wal_checkpoint(TRUNCATE);`
3. Use SQLite Online Backup API to copy DB.
4. Compute SHA-256 of backup file.
5. Release lock.

## 8.2 Never copy live DB files directly
You MUST NOT:
- copy a DB file while WAL is active
- copy DB without checkpoint
- copy DB and WAL at different times

## 8.3 Backup Security
- DB backups MUST be encrypted at rest.
- DB files MUST be chmod 600 (or equivalent).
- Only the application user may read backups.

---

# 9. MIGRATIONS

## 9.1 Schema changes require human approval
AI MUST NOT:
- migrate schema automatically
- run destructive migrations

Schema changes require:
- `destructive-change.json` at repo root
- human approval (2 maintainers)
- CI validation

## 9.2 Migration Steps
1. DAL acquires write lock.
2. Run migration on a copy, not live DB.
3. Run **canary test** (sample queries).
4. Run **checksum verification**.
5. Swap final DB using atomic write sequence.
6. Keep original DB in read-only mode until validated.

---

# 10. REMOTE STORAGE ANNEX (Light)

If using S3/GCS later:

- No rename atomicity exists.
- Use:
  - multipart upload to tmp key
  - compute checksums
  - commit manifest
  - server-side copy to final key
- Locking MUST occur through DB or distributed lock.

(This annex may expand later.)

---

# 11. MONITORING & ALERTING

## 11.1 Thresholds (Hard Rules)
- Disk free < 20% → warn
- Disk free < 10% → critical, stop AI writes
- project.db > 1.6 GB → warn
- map.db > 3.2 GB → warn
- WAL > 500 MB → warning
- failed WAL checkpoints ≥ 3 → critical

AI MUST stop if thresholds exceeded.

---

# 12. AI SAFETY RULES (Storage-Specific)

## 12.1 AI MUST STOP if:
- destructive-change.json is required but missing
- DB exceeds critical size
- tmp directories are not on same filesystem
- manifest missing for the operation
- locks cannot be acquired
- required specs not loaded
- any ambiguity exists in file paths

## 12.2 AI MUST NEVER:
- bypass DAL
- write DB files directly
- modify schema without approval
- delete arbitrary files
- guess missing paths
- skip fsync steps
- skip manifest creation
- skip advisory locks

## 12.3 AI MUST ALWAYS:
- verify free disk space
- verify same-FS constraints
- compute SHA-256 for expected_files
- ensure manifest entry is correct
- request human confirmation before destructive ops

---

# 13. CI REQUIREMENTS

This spec requires CI to:
- Verify ai-docs-index.json paths exist.
- Validate destructive-change.json when present.
- Reject PRs touching storage logic unless this file is updated if needed.
- Reject PRs if STORAGE_ROOT/AI_AUTOMATION_PAUSED exists.
- Optionally validate manifest schemas (future).

---

# 14. FINAL RULE

If code, AI actions, or other docs conflict with this file →  
**THIS FILE IS AUTHORITATIVE.**  
Code must change, not the spec.

