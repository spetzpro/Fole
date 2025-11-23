Version: 1.0.0  
Last-Updated: 2025-11-23  
Status: Authoritative Specification (SSOT)

# _AI_CONCURRENCY_AND_LOCKING_SPEC.md  
Deterministic locking, concurrency rules, and safety guarantees

This document defines how concurrency works across FOLE, including:

- DAL (Data Access Layer) locking rules  
- Filesystem + SQLite locking  
- Cross-resource coordination  
- Avoidance of deadlocks, races, and corruption  
- AI-safe behavioral constraints  

It integrates with:

- _AI_MASTER_RULES.md  
- _AI_STORAGE_ARCHITECTURE.md  
- _AI_DB_AND_DATA_MODELS_SPEC.md  
- _AI_AUTOMATION_ENGINE_SPEC.md  
- _AI_PERFORMANCE_AND_SCALING_SPEC.md  

If a conflict occurs:

1. _AI_MASTER_RULES.md wins  
2. Storage & data integrity specs override this file  
3. This file governs concurrency/locking behavior in all remaining cases  

---

## 1. PURPOSE & SCOPE

This spec ensures that:

1. Concurrent operations never corrupt data (files, DB, manifests).  
2. Writers coordinate cleanly using deterministic locking.  
3. Long-running operations (tiling, imports, exports) obey concurrency limits.  
4. Deadlocks and stale locks are detectable, recoverable, and auditable.  
5. AI agents never attempt concurrency patterns that break invariants.

Covers:

- Lock types and semantics  
- Shared vs exclusive access  
- File operations  
- DB transactions  
- Tile generation  
- Backups and restores  
- Job system concurrency  
- Parallelism boundaries  

---

## 2. LOCKING MODEL OVERVIEW

FOLE uses three levels of locking:

1. Advisory DAL Locks (primary mechanism)  
   - For coordinated access across processes & jobs  
   - Stored in DB (table: `dal_locks`)

2. Filesystem Constraints  
   - Ensures atomic writes, fsync ordering, same-FS rename rules  
   - Defined in _AI_STORAGE_ARCHITECTURE.md

3. SQLite Concurrency Semantics  
   - WAL-mode architecture  
   - Single-writer at a time  
   - Multiple concurrent readers  

Locks are cooperative: code and job workers MUST call the DAL to acquire locks before performing sensitive operations.

---

## 3. DAL LOCKS (PRIMARY LOCKING SYSTEM)

DAL locks are logical locks stored in a dedicated table and managed by the DAL API.

### 3.1 Lock Types

- read  
  - Shared; multiple readers allowed; no writers allowed.  
- write  
  - Exclusive; only one writer; blocks all readers.  
- upgradeable  
  - Special case; allows read → write upgrade atomically.

### 3.2 Lock Record Schema

DAL must store lock records with deterministic structure:

- lock_id: TEXT PRIMARY KEY  
- owner: TEXT (service/user/job ID)  
- lease_expires: TEXT (ISO8601 timestamp)  
- heartbeat_ts: TEXT (last heartbeat)  
- metadata: JSON (caller-defined context)  

### 3.3 Lock Lease & Heartbeat

- Writers MUST renew heartbeat every N seconds (default 10).  
- `lease_expires` is set to now + lease_duration (e.g., 30–60 seconds).  
- If `lease_expires` passes → lock becomes stale.  
- Stale lock recovery allowed only if:  
  - `lease_expires` passed, AND  
  - `heartbeat_ts` older than threshold, AND  
  - no active job claims ownership, AND  
  - recovery event is logged in audit trail.

### 3.4 Lock Upgrade

An upgradeable lock may:

- Begin as shared-read.  
- Upgrade to exclusive-write.  

Upgrade is allowed only if:

- No other shared readers remain for the lock_id.  
- No competing write lock exists.  

Upgrade MUST be atomic within a DB transaction.

---

## 4. LOCKING RULES PER RESOURCE TYPE

### 4.1 Project-Level Lock Rules

Require **project-level write lock** for:

- Editing project metadata.  
- Bulk recalculation jobs (e.g., recomputing indices).  
- Permission/role changes scoped to the project.  
- Applying templates globally to a project.  
- Bulk file imports that affect many maps/sketches.  
- Project-level destructive actions (which also require approvals).

Require **project-level read lock** for:

- Viewing project metadata.  
- Listing maps and sketches.  
- Any read on `project.db`.  

### 4.2 Map-Level Lock Rules

Require **map-level write lock** for:

- Calibration changes.  
- Tile generation or regeneration.  
- Importing floorplans/images onto the map.  
- Heavy operations affecting > 1000 objects on that map.  
- Map deletion.

Require **map-level read lock** for:

- Viewing map data.  
- Exporting a map.  
- Rendering the map viewer.  
- Low-impact read queries (e.g., listing features).

### 4.3 Sketch-Level Lock Rules

Require **sketch-level write lock** for:

- Creating/deleting sketches.  
- Editing geometry or properties.  
- Bulk operations on > 100 objects.  
- Sketch deletion or feature reassignment.

Require **sketch-level read lock** for:

- Viewing sketch content.  
- Hit-testing, selection, and measurement.  
- Tools that read but do not modify sketch data.

---

## 5. FILESYSTEM & ATOMIC WRITE LOCKS

This section inherits atomicity rules from _AI_STORAGE_ARCHITECTURE.md and adds concurrency-specific constraints.

### 5.1 Required Sequence for File Operations

Before writing any file or directory that affects persistent state:

1. Acquire appropriate DAL **write lock** for the target resource (project / map / sketch).  
2. Write files into `<target>/tmp/<uuid>/`.  
3. Fsync each file.  
4. Fsync the tmp directory.  
5. Verify tmp and final directories are on the **same filesystem/device** (e.g., compare `st_dev`).  
6. Rename `<target>/tmp/<uuid>` → `<target>/final_dir` (atomic rename).  
7. Fsync the parent directory of the final path.  
8. Inside a DB transaction: insert/update the manifest row marking state = `committed`.  
9. Commit the transaction using safe DB sync settings.  
10. Release the DAL write lock.

AI agents must never propose shortcuts or alternative sequences for this protocol.

---

## 6. DB LOCKING & TRANSACTION RULES

### 6.1 SQLite Semantics

- SQLite is used in WAL mode (see _AI_STORAGE_ARCHITECTURE.md).  
- WAL allows many concurrent readers and a single writer.  
- Writers must be short-lived and bounded.

Writer rules:

- Always acquire DAL write lock before DB write.  
- Keep transactions as small as practical.  
- Avoid reading large ranges inside a long-running write transaction.  

### 6.2 Query Safety Rules

Queries must:

- Use LIMIT/pagination when scanning large tables.  
- Avoid holding read locks longer than necessary.  
- Avoid using transactions for pure reads (unless snapshot consistency is required).

Forbidden patterns:

- Scans over > 50,000 rows without pagination and filters.  
- Nested transactions using custom hacks (SQLite does not support them the way some other DBs do).  
- Write-then-read behavior that assumes isolation level stronger than SQLite provides.

---

## 7. JOB SYSTEM & CONCURRENCY

### 7.1 Job Scheduling & Concurrency Limits

The job system must:

- Enforce a global cap on concurrent jobs.  
- Enforce per-project caps on concurrent jobs.  
- Distinguish CPU-heavy vs IO-heavy jobs where useful.  
- Ensure fair queuing between projects.

Parameters (configurable per server):

- `maxGlobalJobs`  
- `maxJobsPerProject`  
- `maxConcurrentMapJobsPerProject`  

These caps must be enforced independent of AI proposals.

### 7.2 Jobs and Lock Interaction

Long-running jobs must:

- Acquire appropriate locks early (project/map/sketch).  
- Acquire additional locks if they touch new resources, following deterministic ordering.  
- Release locks as soon as logically possible (do not hold them across waiting periods or external calls).  
- Never hold a write lock longer than necessary to complete a single atomic operation.

Jobs that modify multiple maps/sketches must:

- Acquire locks in a **deterministic order** (see Section 8.1).  
- Avoid nested lock acquisition patterns that can deadlock.

---

## 8. DEADLOCK & STALE LOCK HANDLING

### 8.1 Global Lock Ordering Rule

To prevent deadlocks, any operation requiring more than one lock must acquire them in this global order:

1. Project-level locks (sorted lexicographically by projectId).  
2. Map-level locks (sorted lexicographically by mapId).  
3. Sketch-level locks (sorted lexicographically by sketchId).

AI agents must respect this ordering when proposing operations that span multiple resources.

### 8.2 Stale Lock Detection & Recovery

The system may force-release a lock if all of the following are true:

- `lease_expires` has passed.  
- `heartbeat_ts` is older than the grace period.  
- No active job claims ownership of the lock.  
- A recovery event (who, when, why) is logged in the audit trail.

Force-release operations must be rare and typically initiated by:

- SysAdmin tools.  
- Automated recovery processes with strict safety checks.  

AI agents must NOT propose force-release operations by themselves.

### 8.3 Retry Behavior

If a lock cannot be acquired:

- Use bounded retries with backoff (e.g., exponential backoff with max attempts).  
- Do not spin aggressively or perform infinite retries.  
- On repeated failure, the job should fail gracefully and log the reason.

AI agents must not propose unbounded retry loops.

---

## 9. DISTRIBUTED & MULTI-NODE LOCKING

In multi-node deployments:

- DAL locks must reside in a **central DB** accessible to all nodes.  
- File operations must be routed only to nodes that have access to the correct shared filesystem or object store.  
- Background workers must coordinate via DAL locks and job queues.

AI agents must STOP and ask for guidance if:

- It is unclear whether the deployment is single-node or multi-node.  
- Locking strategy for distributed deployments is not documented.  
- Operations span multiple nodes without a defined orchestration model.

---

## 10. AI RULES FOR CONCURRENCY

AI agents MUST:

- Load this spec before proposing code or changes involving concurrency.  
- Assume that any operation that modifies persistent state requires an appropriate DAL lock.  
- Ask the user for clarification when lock scope is ambiguous (project vs map vs sketch).  
- Respect global lock ordering (project → map → sketch; lexicographic within each level).  
- Prefer using existing locking primitives rather than inventing new patterns.

AI agents MUST NOT:

- Introduce new lock types or custom ad hoc lock tables.  
- Remove existing locking logic without explicit human approval.  
- Disable or weaken lock timeouts or lease behavior.  
- Bypass the DAL to perform “quick” direct file or DB operations.  
- Propose parallel execution that clearly conflicts with locking rules.

AI MUST STOP if:

- It is unclear which lock is required.  
- An operation touches multiple resources without a clear acquisition order.  
- Manifest or storage rules from _AI_STORAGE_ARCHITECTURE.md are not understood.  
- DB transaction boundaries are unclear.  
- The user’s intent regarding concurrency or parallelism is ambiguous.

STOP =  
No code changes, no job definition, no concurrent operations.  
Ask for clarification instead.

---

## 11. RELATION TO OTHER SPECS

This document works together with:

- _AI_STORAGE_ARCHITECTURE.md — defines atomic write semantics and manifest protocols.  
- _AI_DB_AND_DATA_MODELS_SPEC.md — defines DB schemas and relationship constraints.  
- _AI_AUTOMATION_ENGINE_SPEC.md — defines job scheduling, approval, and lifecycle.  
- _AI_PERFORMANCE_AND_SCALING_SPEC.md — defines performance budgets and scaling strategies.  

If conflicts arise:

1. _AI_MASTER_RULES.md (safety & governance) overrides everything.  
2. _AI_STORAGE_ARCHITECTURE.md governs persistence and atomicity.  
3. _AI_DB_AND_DATA_MODELS_SPEC.md governs schema correctness.  
4. This file (_AI_CONCURRENCY_AND_LOCKING_SPEC.md_) governs locking and ordering.  

---

## 12. END OF DOCUMENT

This document is authoritative.  
All services, modules, and AI agents MUST follow it exactly.
