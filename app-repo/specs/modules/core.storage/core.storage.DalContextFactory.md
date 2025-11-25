# Module: core.storage.DalContextFactory

## 1. Purpose
Create per-project DB contexts.

## 2. Responsibilities
- Map projectId to db.sqlite path
- Construct DalContext

## 3. Public API
~~~ts
export interface DalContext {
  run<T>(sql: string, params?: unknown[]): Promise<Result<T>>;
  all<T>(sql: string, params?: unknown[]): Promise<Result<T[]>>;
}

export function createDalContextForProject(projectId: ProjectId): Promise<Result<DalContext>>;
~~~
