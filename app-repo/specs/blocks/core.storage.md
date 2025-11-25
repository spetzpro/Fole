# Block: core.storage

## 1. Purpose / Responsibility

Provide a unified abstraction over:

- Project metadata and registry
- Database access (DAL)
- File storage under the canonical `.storage` root
- Atomic/consistent write operations

### Not Responsible For

- Business rules about what can be stored (delegated to features and permissions)
- Rendering data (delegated to UI)
- Global concurrency policy (but it cooperates with `core.concurrency` if present)

---

## 2. High-Level Summary

`core.storage` is the backbone of how data lives on disk and in the DB.

It knows:

- Where `.storage` is and how projects map to directories
- How to open a project’s DB connection
- How to safely write files and project artifacts

Feature blocks (sketch/maps/etc.) rely on this to store their own files and records.

---

## 3. Modules in This Block

| Module              | Responsibility                                           | Status  |
|---------------------|----------------------------------------------------------|---------|
| ProjectModel        | Defines project metadata types                           | planned |
| ProjectRegistry     | List, open, create projects                              | planned |
| ProjectPathResolver | Resolve paths inside `.storage/projects/<id>/...`        | planned |
| DalContextFactory   | Create DB contexts per project (e.g., SqliteDalContext)  | in code |
| FileStorage         | Low-level file IO + atomic write helpers                 | planned |

(Existing `SqliteDalContext` and lock-related pieces are part of `DalContextFactory` ecosystem.)

---

## 4. Data Model

Persistent:

- `Project`:
  - `id`
  - `name`
  - `createdAt`
  - `lastOpenedAt`
  - `paths` (root paths inside `.storage`)

File layout (MVP, simplified):

```txt
.storage/
  projects/
    <projectId>/
      project.json
      db.sqlite
      files/
      logs/
```

---

## 5. Interactions

**Called By**

- `core.ui` to enumerate and open projects
- Feature blocks (sketch, map) to resolve paths and get DB contexts
- `core.auth`/backend for per-project data (indirectly)

**Depends On**

- `core.foundation` (config, logging)
- Optional: `core.concurrency` for locking/atomicity

Example API:

```ts
import { listProjects, openProject } from '@/core/storage/ProjectRegistry';
import { getProjectPath } from '@/core/storage/ProjectPathResolver';
import { createDalContext } from '@/core/storage/DalContextFactory';
```

---

## 6. Events & Side Effects

- Creates directories and files under `.storage`
- Opens DB connections
- Emits diagnostic events on:
  - Project created/opened
  - Storage errors
  - Migration runs

---

## 7. External Dependencies

- Node fs / fs-extra or equivalent abstraction
- Sqlite driver (for `db.sqlite`)

---

## 8. MVP Scope

- Discover/create `.storage` root and `/projects` folder
- `ProjectRegistry` with:
  - `listProjects()`
  - `createProject(name)`
  - `openProject(id)`
- `ProjectPathResolver` that provides:
  - `getProjectRoot(projectId)`
  - `getProjectDbPath(projectId)`
  - `getProjectFilesRoot(projectId)`
- Basic `DalContextFactory` that:
  - Returns DB context per project (using current `SqliteDalContext`)
- `FileStorage` with atomic write helper:
  - `writeFileAtomic(path, data)`
