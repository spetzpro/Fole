# Module: core.storage.ProjectRegistry

## 1. Purpose
List, create, and open projects under .storage/projects.

## 2. Responsibilities
- Scan for project.json files
- Create new project directories
- Update lastOpenedAt
- Integrate with MigrationRunner

## 3. Public API
~~~ts
export interface ProjectRegistry {
  listProjects(): Promise<Result<Project[]>>;
  getProjectById(id: ProjectId): Promise<Result<Project | null>>;
  createProject(name: string): Promise<Result<Project>>;
  openProject(id: ProjectId): Promise<Result<Project>>;
}

export function getProjectRegistry(): ProjectRegistry;
~~~
