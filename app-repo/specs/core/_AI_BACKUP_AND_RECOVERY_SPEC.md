Version: 1.0.0  
Last-Updated: 2025-11-23  
Status: Authoritative Specification (SSOT)

# _AI_BACKUP_AND_RECOVERY_SPEC.md  
Backup, snapshotting, recovery, disaster-recovery, and restore rules for FOLE.

This document is authoritative for all backup, export, restore, migration-rollback, and disaster-recovery behaviors.  
It binds ALL AI agents, backend processes, sysadmins, and CI jobs.

---

# 1. PURPOSE & GUARANTEES

Backup and recovery MUST guarantee:

1. **No Corruption** — restored data must be byte-accurate and internally consistent.  
2. **Deterministic Restores** — no guessing, no heuristics.  
3. **Atomicity** — backups represent a single coherent point-in-time.  
4. **Auditability** — all actions logged, checksums preserved.  
5. **Portability** — restored STORAGE_ROOT must behave identically on any host.  
6. **AI Safety** — strict STOP conditions, no autonomous repair attempts.

Backups must support:
- server-wide backups  
- per-project exports  
- module-level asset exports  
- disaster recovery  
- optional incremental backups  

---

# 2. IN-SCOPE DATA

Backups include:

- Entire `STORAGE_ROOT/`  
- All project directories  
- All module data  
- SQLite DBs: `core.db`, `project.db`, `map.db`, module DBs  
- Tiles, raster images, vector assets  
- Uploaded files  
- Template overrides  
- Automation logs  
- Audit history  
- Config directories

NOT included:
- source code  
- ephemeral caches  
- RAM state  

---

# 3. BACKUP TYPES

## 3.1 Full Backup (Mandatory)
Captures the entire `STORAGE_ROOT`, with:
- SQLite snapshots via Online Backup API  
- sha256 checksums for all files  
- manifest.json describing backup metadata  

## 3.2 Incremental Backup (Optional)
- Per-file sha256 diff model  
- Changed DBs stored as full DB snapshots (no WAL diffs)

## 3.3 Project-Level Export
Portable, self-contained export:
- project dir  
- project.db + map.db snapshots  
- tiles + assets  
- project templates  
- manifest  

## 3.4 Module-Level Export
Modules may expose:
- module-data/  
- module-settings.json  
- module.db  

---

# 4. BACKUP MANIFEST SPEC

File: `manifest.json`

```
{
  "backupId": "uuid",
  "createdAt": "2025-11-23T12:33:00Z",
  "createdBy": "user@example.com",
  "foleVersion": "X.Y.Z",
  "storageSpecVersion": "1.1.0",
  "modules": ["maps", "sketch"],
  "projects": [
    {
      "projectId": "abc123",
      "projectDb": "sha256:...",
      "mapDbs": ["sha256:..."],
      "files": [{ "path": "path", "sha256": "..." }]
    }
  ],
  "core": {
    "coreDb": "sha256:...",
    "templates": { "server-defaults.json": "sha256:..." }
  },
  "fullFileList": [
    { "path": "relative/path", "sha256": "..." }
  ]
}
```

Rules:
- sha256 required for **every file**
- no absolute paths  
- no symlinks  
- manifest MUST be present  

---

# 5. BACKUP CREATION PROTOCOL

1. Acquire Global Storage Lock  
2. Quiesce System  
3. Snapshot SQLite via Online Backup API  
4. Snapshot all files  
5. Generate manifest  
6. Package backup atomically  
7. Release lock  

---

# 6. RESTORE TYPES

- Full Restore  
- Project Restore  
- Merge Restore (dangerous; 2-human approval)

---

# 7. RESTORE PROTOCOL

Restore MUST:

1. Validate backup manifest  
2. Validate sha256 for ALL files  
3. Validate DB integrity  
4. Compare FOLE version  
5. Ensure module set compatibility  
6. Acquire global lock  
7. Replace data atomically  
8. Rebuild caches  
9. Release lock  

STOP if any step fails.

---

# 8. DISASTER RECOVERY (DR)

- RTO target: **1 hour**  
- RPO target: **15 minutes** (incremental)  
- Monthly restore drill  
- Quarterly disaster simulation  
- Offsite replication required  

---

# 9. BACKUP STORAGE RULES

- Backups must be encrypted  
- Backups must be versioned  
- Checksums mandatory  
- Offsite copies required  
- Rotations: daily/weekly/monthly policy  

---

# 10. AI RULES

AI MUST:

- Load this spec before proposing backup/restore  
- Verify permissions (SysAdmin or delegated)  
- Treat missing manifest as STOP  
- Treat checksum mismatch as STOP  
- Treat integrity failure as STOP  
- Treat unclear intent as STOP  

AI MUST NOT:
- Merge backups manually  
- Perform restore without explicit user approval  
- Attempt correction of corrupted backups  

---

# 11. MIGRATION INTERACTION

- Backups required before schema or storage migration  
- Rollback procedure uses previous validated backup  

---

# 12. EXPORT / IMPORT RELATION

Exports = scoped mini-backups.  
Imports follow restore protocol.

---

# 13. SECURITY RULES

- Encrypt backups at rest and in transit  
- Restrict access to trusted roles  
- Apply redactions for logs if sensitive  
- Maintain immutable audit logs  

---

# 14. INTEGRITY & VERIFICATION

Weekly:
- Verify backup manifests  
- Validate random file checksums  
- Run DB integrity checks  

Monthly:
- Full restore test on staging  

---

# 15. STOP CONDITIONS

AI MUST STOP on:

- checksum mismatch  
- missing manifest  
- DB integrity error  
- missing permissions  
- version mismatch  
- module set mismatch  
- ambiguous intent  
- unclear restore target  

STOP = Ask the user.

---

End of document  
_AI_BACKUP_AND_RECOVERY_SPEC.md  
Authoritative for all agents and backend systems.
