Version: 1.0.0  
Last-Updated: 2025-11-23  
Status: Authoritative Specification (SSOT)

# _AI_SEARCH_AND_INDEXING_SPEC.md  
Search, indexing, ranking, ACL filtering, and AI behavior rules.

This document defines how FOLE implements **search and indexing** across:

- projects  
- maps & geo features  
- sketches & annotations  
- files & images  
- logs & audit artifacts (partially)  

It is binding for:

- all AI agents  
- backend services  
- modules that expose search  
- any future search UIs (global search, per-project search, per-module search)

---

## 1. PURPOSE & GOALS

The search system must:

1. Provide **fast, relevant search** across all major entities.  
2. Respect **permissions and project boundaries** at all times.  
3. Avoid leaking data across projects or tenants.  
4. Be **eventually consistent**, with clearly documented delay targets.  
5. Be safe for AI: no guessing about ACLs, no indexing forbidden data.  
6. Be **extensible** to new modules and entity types.

Search must support at least:

- Global “command palette” style search.  
- Per-project search.  
- Module-specific search (e.g., maps, sketches, files).  
- Geo-aware search for maps/features.  

---

## 2. SCOPE

Covered:

- Logical architecture of search.  
- Index types (text, structured, spatial).  
- What is indexed and what is excluded.  
- ACL filtering and project isolation.  
- Update and invalidation rules.  
- AI usage rules: how agents may propose/add search features.

Not covered:

- Exact library choices (e.g., SQLite FTS vs external engine).  
- Low-level query syntax (SQL, HTTP).  
- Full-text ranking algorithms beyond core principles.

Implementation details must live in module/block specs and DB schema, not here.

---

## 3. HIGH-LEVEL ARCHITECTURE

3.1 Core Concepts

FOLE search is built around:

- **Primary data stores**  
  - SQLite / Postgres (see _AI_DB_AND_DATA_MODELS_SPEC.md)  
  - Files & tiles under STORAGE_ROOT (see _AI_STORAGE_ARCHITECTURE.md)  

- **Indexes**  
  - Text indexes (names, descriptions, annotations, OCR text).  
  - Structured indexes (IDs, types, projectId, timestamps, tags).  
  - Spatial indexes (for geo, via R-tree / PostGIS).  

- **Search APIs**  
  - Global search endpoint.  
  - Per-project search endpoint.  
  - Module-specific search endpoints.

3.2 Index Ownership

- **Core search service** owns the canonical global indexes.  
- Modules do NOT create ad-hoc, uncoordinated search indexes.  
- Each module defines:
  - which entities are searchable,  
  - which fields are indexed,  
  - how to map them into core search schemas.

3.3 Consistency Model

- Search is **eventually consistent** with source-of-truth DBs.  
- Target: updates visible in search within **N seconds** (configurable, default 10–60s).  
- AI must assume a small delay and must not assume immediate reflectance after writes.

---

## 4. INDEXED ENTITIES

The search system must index at least:

4.1 Projects

Fields (minimal set):

- projectId  
- name  
- description  
- category (e.g., factory, building, stellar)  
- tags  
- createdAt, updatedAt  

Searchable by:

- name/description text  
- tags  
- category  
- ID (direct lookup)  

4.2 Maps

Fields:

- mapId  
- projectId  
- name  
- description  
- mapType (floorplan, terrain, globe, etc.)  
- calibrated (boolean)  
- CRS / celestial body (ref to geo spec)  
- tags  

Searchable by:

- name / description  
- type  
- project + map attributes  
- “calibrated only” or “uncalibrated only” filters

4.3 Sketches

Fields:

- sketchId  
- projectId  
- mapId (nullable if unplaced)  
- featureType (sketch feature category)  
- name / user-label  
- tags  
- properties (selected stable subset for indexing)  

Text indexing:

- user-provided titles / labels  
- stable annotations (not ephemeral debug text)  

4.4 Files & Assets

Fields:

- fileId  
- projectId  
- filename  
- fileType (pdf, png, tiff, dwg, etc.)  
- mimeType  
- tags  
- attachedTo (mapId, sketchId, cabinet, etc.)  

Text indexing (where safe and feasible):

- extracted text for PDFs (if pipeline supports)  
- alt text / descriptions  
- NOT raw binary data  

4.5 Geo Features (Map Features)

Depending on implementation (vector layers, feature DB):

- featureId  
- projectId  
- mapId  
- layerId  
- geometry (indexed in spatial index)  
- type (point, line, polygon, symbol)  
- key attributes (name, code, label)  

Support:

- “find feature by code/name”  
- “find features near coordinate X/Y in map”  

4.6 Logs / Audit (Limited Search)

Only limited, admin-oriented search:

- By projectId  
- By actor (user)  
- By action type  
- By time range  

Full-text over entire raw log lines is optional and must respect security/privacy (see _AI_SECURITY_AND_COMPLIANCE_SPEC.md).

---

## 5. INDEX TYPES & STORAGE

5.1 Text Indexes

- Backed by FTS (SQLite FTS / Postgres FTS / external engine).  
- Fields tokenized by language-aware rules when possible.  
- Support substring/prefix search for names, tags, and IDs.

5.2 Structured Indexes

- B-tree / hash indexes on:
  - projectId  
  - mapId  
  - sketchId  
  - type/domain  
  - timestamps  
  - tags (where flattened)

5.3 Spatial Indexes

- Use geo engine defined in _AI_GEO_AND_CALIBRATION_SPEC.md.  
- For SQLite:
  - R-tree indexes for bounding boxes.  
- For PostGIS:
  - GIST/BRIN indexes on geometry column.  

Required operations:

- “find features near lat/lon / ENU coordinate within radius R”  
- “find features intersecting bounding box”  

All spatial search must combine with ACL filters.

---

## 6. ACL & TENANCY RULES

6.1 Strict Project Isolation

- No search result may ever include entities from a project the user cannot access.  
- Global search must first filter by project membership / roles.  
- System roles (e.g., SysAdmin) may see more, but still respect explicit rules from _AI_ROLES_AND_PERMISSIONS.md.

6.2 ACL Filtering First, Ranking Second

- Filtering by ACL happens before ranking.  
- Search pipeline:

  1. Determine accessible projects / entities from permissions.  
  2. Restrict search scope to those.  
  3. Execute query within that scope.  
  4. Rank results.

6.3 AI MUST NOT:

- Work around ACLs by hitting raw index backends directly.  
- Propose “global search across all tenants” without strict roles and explicit requirements.  
- Store search results in a way that bypasses future ACL changes (e.g., caching IDs across sessions without re-checking ACL).

---

## 7. QUERY ENTRYPOINTS

7.1 Global Search

- UI element (e.g., header search / command palette).  
- Default scope: all projects user has access to.  
- Result types grouped:

  - Projects  
  - Maps  
  - Sketches  
  - Files/assets  
  - Geo features (optionally)  

- Each result indicates its type and project.

7.2 Project Search

- Search UI inside a specific project context.  
- Scope restricted to that projectId.  
- May have filters for entity type (map, sketch, file, feature).

7.3 Module-Specific Search

Examples:

- Map module: “search maps” and “search features”.  
- Sketch module: “search sketches by feature type, tags, properties”.  
- File module: “search files by type, tags, attachments”.

Each module must:

- Define public search API signature.  
- Use core search infrastructure, not custom independent indexes.

---

## 8. RANKING PRINCIPLES

High-level ranking signals (descending priority):

1. **Exact ID or code match** (e.g., mapId, feature code).  
2. Exact name/label match.  
3. Starts-with match on name/label.  
4. Tag matches.  
5. Full-text relevance (term frequency, fields weights).  
6. Recency (updatedAt).  
7. Project affinity (current project boosted).  

AI must not hard-code ranking formulas. Implementation details live in the search backend / config.

---

## 9. INDEX UPDATE & INVALIDATION RULES

9.1 Triggers

Index updates occur on:

- Project created/updated/deleted.  
- Map created/updated/deleted.  
- Sketch created/updated/deleted.  
- File uploaded/renamed/tags changed/deleted.  
- Geo feature created/updated/deleted.  

9.2 Modes

Two modes (configurable per deployment):

- **Synchronous indexing (small setups)**  
  - Write → within same transaction, update indexes.  
- **Asynchronous indexing (recommended)**  
  - Write → emit event / job → background indexer updates indexes.

9.3 Consistency Targets

- Must define a max indexing delay (e.g., 60 seconds for async).  
- Indexers must be idempotent and retry-safe.  
- Retry after failure with backoff.

9.4 Deletion Semantics

- Deleting an entity must remove it from all relevant indexes.  
- Soft-deleted entities (if used) must be excluded from normal search results unless explicitly requested.

---

## 10. SPECIAL CASES

10.1 OCR & Content Extraction

If the file pipeline supports OCR or text extraction:

- Extracted text may be indexed for search.  
- Sensitive fields must respect _AI_SECURITY_AND_COMPLIANCE_SPEC.md.  
- AI must not enable OCR indexing on sensitive or restricted file classes without explicit human approval.

10.2 Large Assets & Throttling

- Indexing large batches (e.g., a big folder of tiles/files) must go through the **job/automation system** (_AI_AUTOMATION_ENGINE_SPEC.md).  
- Jobs must specify resource limits, and indexing must honor them.

10.3 Partial & Fuzzy Matching

- Fuzzy search is allowed but must not degrade performance drastically.  
- Implementations should allow configuration to turn fuzzy matching on/off by project or deployment.

---

## 11. AI AGENT RULES

AI agents must:

- Load this spec before designing search or indexing features.  
- Use documented search APIs and not raw DB queries unless the module spec explicitly allows it.  
- Always include ACL scope in queries (project, roles).  
- Be conservative about what is indexed; never index:

  - raw secrets,  
  - environment variables,  
  - backup contents outside documented search scope.

AI agents must STOP if:

- The entity type’s search/indexing behavior is not documented.  
- ACL scope is unclear.  
- Indexing a field might violate storage or security specs.  
- Search backend choice (SQLite vs Postgres vs external) is ambiguous in the current deployment.

---

## 12. EXTENSIBILITY RULES

12.1 New Entity Types

When a new entity type becomes searchable:

- Its module/block spec must define:
  - indexable fields,  
  - ACL model,  
  - how it maps into global search.  

- AI must update:
  - module spec,  
  - search configuration,  
  - tests (see _AI_TESTING_AND_VERIFICATION_SPEC.md).

12.2 External Search Engines

If deployment uses an external search engine (e.g., OpenSearch):

- This spec still governs **what** is indexed and **how** ACLs are applied.  
- Implementation details (shards, replication) live in infra docs.  
- AI must NOT change core search topology without destructive-change governance.

---

## 13. LOGGING & MONITORING

Search subsystem must expose metrics (see _AI_MONITORING_AND_ALERTING_SPEC.md):

- query_count  
- query_latency_ms  
- index_update_latency_ms  
- index_error_count  
- acl_filter_mismatch_count (if detected)  

Errors must be logged and available for diagnostics (see _AI_ERROR_HANDLING_AND_DIAGNOSTICS_SPEC.md).

---

## 14. RELATION TO OTHER SPECS

This spec interacts with:

- _AI_MASTER_RULES.md (global AI governance)  
- _AI_STORAGE_ARCHITECTURE.md (STORAGE_ROOT, atomicity)  
- _AI_DB_AND_DATA_MODELS_SPEC.md (schemas, indexes)  
- _AI_GEO_AND_CALIBRATION_SPEC.md (spatial math)  
- _AI_ROLES_AND_PERMISSIONS.md (ACLs, role model)  
- _AI_FILE_AND_IMAGE_PIPELINE_SPEC.md (text extraction, OCR)  
- _AI_MONITORING_AND_ALERTING_SPEC.md (metrics & alerts)  

If conflicts arise:

1. _AI_MASTER_RULES.md wins for governance & STOP rules.  
2. _AI_ROLES_AND_PERMISSIONS.md wins for ACL behavior.  
3. _AI_STORAGE_ARCHITECTURE.md wins for storage semantics.  
4. This spec governs search/index behavior within those constraints.

---

End of document  
_AI_SEARCH_AND_INDEXING_SPEC.md  
This document is authoritative.  
All AI agents and backend services MUST follow it exactly.
