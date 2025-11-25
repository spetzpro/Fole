# Module: core.storage.MigrationRunner

## 1. Purpose
Ensure the project's DB schema matches the expected version.

## 2. Public API
~~~ts
export const CURRENT_DB_SCHEMA_VERSION = 1;

export function ensureProjectDbIsMigrated(
  project: Project,
  dalContext: DalContext
): Promise<Result<Project>>;
~~~

## 3. Behavior
- Initialize schema to v1 if new
- Validate existing dbSchemaVersion
- Error on incompatible versions
