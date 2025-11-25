# Module: core.storage.ProjectPathResolver

## 1. Purpose
Resolve deterministic filesystem paths for projects.

## 2. Responsibilities
- Compute paths for project root, db, files, logs, tmp, cache

## 3. Public API
~~~ts
export interface ProjectPaths {
  rootDir: string;
  projectJsonPath: string;
  dbPath: string;
  filesDir: string;
  logsDir: string;
  tmpDir: string;
  cacheDir: string;
}

export function getProjectPaths(projectId: ProjectId): ProjectPaths;
export function getProjectsRoot(): string;
~~~
