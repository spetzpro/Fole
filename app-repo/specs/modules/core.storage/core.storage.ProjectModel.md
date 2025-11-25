# Module: core.storage.ProjectModel

## 1. Purpose
Define the core types for projects and their metadata, including versioning and paths.

## 2. Responsibilities
- Define ProjectId
- Define Project and project.json schema
- Validate and convert between JSON and in-memory objects

## 3. Types
~~~ts
export type ProjectId = string & { readonly __brand: "ProjectId" };

export interface Project {
  id: ProjectId;
  name: string;
  createdAt: string;
  lastOpenedAt: string;
  projectVersion: number;
  dbSchemaVersion: number;
  meta: Record<string, unknown>;
}

export interface ProjectJsonV1 {
  id: string;
  name: string;
  createdAt: string;
  lastOpenedAt: string;
  version: number;
  dbSchemaVersion: number;
  meta?: Record<string, unknown>;
}
~~~

## 4. Public API
~~~ts
export function createNewProject(id: ProjectId, name: string, nowIso: string): Project;
export function projectToJson(project: Project): ProjectJsonV1;
export function projectFromJson(raw: unknown): Result<Project>;
~~~
