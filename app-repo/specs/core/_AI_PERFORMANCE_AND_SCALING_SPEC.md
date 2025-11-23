Version: 1.0.0  
Last-Updated: 2025-11-23  
Status: Authoritative Specification (SSOT)

# _AI_PERFORMANCE_AND_SCALING_SPEC.md  
Performance, scalability, and resource-behavior rules for FOLE

This document defines **how the system must behave under load** and how it is allowed to **scale** over time.  
It is binding for:

- All backend services and modules
- All AI agents proposing changes to storage, DB, jobs, or architecture
- Sysadmin tooling that affects performance or resource usage

It must be read together with:

- `_AI_STORAGE_ARCHITECTURE.md`
- `_AI_DB_AND_DATA_MODELS_SPEC.md`
- `_AI_AUTOMATION_ENGINE_SPEC.md`
- `_AI_MONITORING_AND_ALERTING_SPEC.md`

If there is a conflict:

1. `_AI_MASTER_RULES.md` wins  
2. Storage & data integrity specs win  
3. This spec governs performance/scaling details  

---

## 1. PURPOSE & SCOPE

Goals:

1. Keep the system **fast enough to be usable** in realistic field conditions.
2. Ensure performance optimizations **never break correctness or data integrity**.
3. Provide a roadmap for **scaling from single-instance SQLite** to **multi-instance Postgres + object storage**.
4. Define **limits, quotas, and STOP rules** that AIs must obey when designing or modifying code.

Covers:

- Request latency and concurrency expectations
- DB and storage performance considerations
- Job system behavior under load (tiling, imports, exports)
- Caching and memoization rules
- Scaling strategies (vertical, horizontal, DB migration)
- Per-project isolation and noisy-neighbor protection

---

## 2. PERFORMANCE PRINCIPLES

2.1 Correctness Over Speed  
No optimization may:

- violate atomic write rules,
- bypass the DAL,
- break permission checks,
- or corrupt data under race conditions.

2.2 Predictable Degradation  
Under heavy load, the system must:

- degrade **gracefully** (slower responses),
- not fail silently,
- and not corrupt data.

2.3 No Hidden Work  
Long-running operations must:

- be tracked as jobs/operations,
- show progress,
- be cancellable when possible.

2.4 Per-Project Fairness  
One "heavy" project must not starve others.  
Per-project quotas and rate limits are mandatory for job-heavy operations.

2.5 Observability First  
Performance-related changes must include:

- new or updated metrics,
- logging for critical paths,
- clear configuration toggles.

---

## 3. PERFORMANCE DOMAINS

We distinguish:

1. API & Backend Latency  
   - Request → response, excluding background jobs.

2. Database Operations  
   - Queries, writes, migrations, indexing.

3. Storage & Filesystem  
   - Tile I/O, uploads, exports, backups.

4. Job System  
   - Long-running tasks, queue behavior, concurrency.

5. Frontend / UI  
   - Per-window performance, rendering, network usage.

6. Network & Remote Services  
   - External AI APIs, object storage, remote DBs.

Each area must have explicit limits and monitoring hooks (see `_AI_MONITORING_AND_ALERTING_SPEC.md`).

---

## 4. BASELINE TARGETS (GUIDANCE, NOT HARD SLAs)

These are design targets for a “normal” deployment (single server, local SQLite, < 50 active users):

- Typical API requests (non-heavy)  
  - Target: p95 latency ≤ 300 ms  
  - Hard cap: p99 ≤ 1 s (beyond that must be investigated)

- Simple UI actions (pan/zoom/selection)  
  - Target: 60 FPS for light scenes  
  - Must never block main thread for > 100 ms

- Medium-sized project  
  - Up to ~100 maps, ~1000 sketches, ~100k sketch objects  
  - Must remain usable without forced migration to Postgres.

- Large project warning thresholds  
  - Project DB size > 1.5 GB → warning  
  - Map DB size > 3 GB → warning  
  - Total tiles for a map > 5 million → warning

These are not contractual SLAs, but the system must be designed so that violating them generates alerts and is considered a sign to scale up or out.

---

## 5. DATABASE PERFORMANCE RULES

5.1 SQLite (Default Engine)

- Must use WAL mode as specified in `_AI_STORAGE_ARCHITECTURE.md`.
- Reads may be concurrent; writes must respect advisory locking.
- Heavy queries must be:
  - Indexed,
  - Bounded (LIMIT / pagination),
  - Avoiding full-table scans on large tables where possible.

5.2 Query Design

- Any query touching more than 10k rows must be treated as “heavy” and considered for:
  - Pagination,
  - Background job,
  - Precomputed summary or cache.

- N+1 patterns must be avoided; use joins or batched lookups via DAL.

5.3 DB Indexing

- Indexes may be added if:
  - They significantly reduce query time on hot paths, and
  - They do not cause unacceptable write amplification.

- AIs must not:
  - Drop indexes without a human-reviewed migration.
  - Add unbounded numbers of indexes (schema bloat).

5.4 Migration to Postgres

- Postgres is recommended when:
  - Core DB > 4 GB, or
  - Write contention becomes a bottleneck, or
  - Advanced querying (PostGIS, full-text) is required.

- Migration rules are defined in `_AI_STORAGE_ARCHITECTURE.md` and `_AI_DB_AND_DATA_MODELS_SPEC.md`.  
  This spec adds that:
  - Postgres migrations must be **canary tested**,
  - Must not introduce query patterns that assume unlimited resources,
  - Must still support per-project isolation concepts.

---

## 6. STORAGE & FILE I/O PERFORMANCE

6.1 General Rules

- All heavy file operations must be implemented as jobs via the operations/automation system.
- No synchronous blocking of HTTP requests on:
  - Tile generation,
  - Large imports,
  - Large exports,
  - Backups or restores.

6.2 Tiles & Map Assets

- Access patterns must be:
  - Read-optimized for typical zoom and pan,
  - Cached on disk and/or in memory according to `_AI_FILE_AND_IMAGE_PIPELINE_SPEC.md`.

- Bulk tile generation must:
  - Run in bounded parallelism (configurable worker count),
  - Respect per-project disk quotas,
  - Surface progress to the user.

6.3 Backups & Exports

- Backup frequency must balance:
  - I/O load,
  - RPO expectations.

- AIs must not schedule high-frequency backups or exports without explicit user confirmation and quota awareness.

---

## 7. JOB SYSTEM & CONCURRENCY

7.1 Job Types

- Compute-heavy: tiling, image processing, rasterization.
- IO-heavy: backups, imports, exports.
- Mixed: migrations, bulk recalculations.

7.2 Concurrency Limits

- Global max concurrent jobs: configurable.
- Per-project:
  - Max concurrent heavy jobs (e.g. default 2).
  - Queue length thresholds (beyond which warnings are emitted).

7.3 Fair Scheduling

- Job scheduler must be:
  - Fair across projects,
  - Resistant to one project flooding the queue,
  - Aware of job type (compute vs IO).

7.4 AI Rules

- AI agents proposing automations must:
  - Respect resource hints (`estimatedCost`, `maxRuntimeSeconds`, etc.).
  - Avoid scheduling multiple heavy jobs in parallel for the same project.
  - STOP if quotas or limits are unknown or missing.

---

## 8. FRONTEND / UI PERFORMANCE

8.1 General Rules

- No blocking operations on main thread beyond ~16 ms in tight loops.
- Long operations must:
  - Use workers or async calls,
  - Show progress, not freeze the UI.

8.2 Window & Viewer Efficiency

- Viewer windows must:
  - Use level-of-detail / decimation for very dense scenes.
  - Culling:
    - Only render visible area.
    - Avoid drawing off-screen objects.

- Sketch rendering:
  - Large sketches (> N objects) should be drawn using batched primitives where appropriate.
  - Hit-testing should be spatially indexed for dense scenes (e.g. via quadtrees or grids), not naive full scans.

8.3 Network Usage

- UI must:
  - Use pagination/infinite scroll in list views.
  - Avoid fetching entire project inventories when only small subsets are needed.
  - Cache recent API responses where safe.

8.4 AI Rules

- AI modifying frontend must:
  - Prefer existing patterns for pagination and debouncing.
  - Not introduce heavy polling.
  - STOP if unsure whether to paginate, and ask for acceptable UX.

---

## 9. CACHING RULES

9.1 What Can Be Cached

- Derived data that can be recomputed:
  - Tile pyramids,
  - Thumbnail images,
  - Search indexes,
  - Analytical aggregates.

- Never cache:
  - Sensitive secrets,
  - Raw permission decisions without invalidation hooks.

9.2 Cache Invalidation

- Caches must be scoped:
  - Per project,
  - Per map,
  - Per user where permission-sensitive.

- Invalidation triggers must be defined when:
  - Underlying map or sketch changes,
  - Permissions or roles change.

9.3 Cache Limits

- Cache size must be bounded per project and global.
- When limits are exceeded, **eviction** must be predictable (LRU or similar).

9.4 AI Rules

- AIs may propose caches only if:
  - The data is clearly derived and safe to recompute.
  - Invalidation logic is explicitly defined.
  - They do not hardcode infinite lifetimes.

---

## 10. SCALING STRATEGIES

10.1 Vertical Scaling (Single Node)

- First approach: better CPU, RAM, disk.
- Still must respect:
  - Quotas,
  - Job limits,
  - Monitoring thresholds.

10.2 Horizontal Scaling (Multi-Instance)

- When adding multiple app servers:
  - State must be centralized in DB and storage,
  - Job queue must support multi-worker coordination,
  - Sticky sessions should only be used when necessary.

10.3 DB Scaling

- Paths:
  - SQLite (default) → Postgres single-node → Postgres + read replicas.
- AI may not design sharding schemes without explicit human design input.

10.4 File / Object Storage

- Local filesystem first.
- Optional remote object storage later; must be:
  - Integrated via the storage abstraction,
  - Aware of latency and cost tradeoffs.

---

## 11. MULTI-TENANT & NOISY NEIGHBOR PROTECTION

11.1 Per-Project Limits

- Disk quota per project: configurable.
- Max concurrent jobs per project.
- Rate limits on:
  - Tile creation,
  - File uploads,
  - Query-heavy endpoints.

11.2 System-Level Limits

- Global hard caps for:
  - Total jobs,
  - Disk usage thresholds,
  - CPU/memory saturation.

11.3 AI Rules

- AI must not:
  - Propose per-project defaults that effectively disable quotas,
  - Design modules that ignore these limits.

---

## 12. AI AGENT RULES (PERFORMANCE & SCALING)

AI agents must:

1. Load this spec when:
   - Proposing DB schema or index changes,
   - Tweaking job system or scheduling,
   - Introducing new caching layers,
   - Designing migration paths,
   - Changing tile / image processing pipelines.

2. Assume:
   - modest hardware, not infinite capacity,
   - mixed workloads from multiple users and projects.

3. Prefer:
   - Simple, robust designs over micro-optimizations,
   - Incremental scaling paths that keep SQLite viable for small deployments.

AI agents must not:

- Introduce busy-wait loops or tight polling.
- Bypass the job system for long operations.
- Remove quotas, limits, or resource checks without replacement.
- Design changes that assume specific hardware (e.g. “must have GPU”).

---

## 13. STOP CONDITIONS

AI MUST STOP and ask a human if:

- A proposed change increases concurrency without clear locking rules.
- A resource-intensive feature is being added without:
  - job integration,
  - quotas,
  - monitoring hooks.
- There is ambiguity over:
  - SQLite vs Postgres deployment,
  - single-node vs multi-node environment.
- A migration or refactor might:
  - break per-project isolation,
  - or require changes in other specs.

STOP = do not optimize, do not merge, do not apply migrations, until clarified.

---

End of document  
_AI_PERFORMANCE_AND_SCALING_SPEC.md  
This document is authoritative. All AI agents and backend services MUST follow it exactly when dealing with performance or scaling.
