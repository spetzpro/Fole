import type { Result } from "../../foundation/CoreTypes";

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

export function createNewProject(id: ProjectId, name: string, nowIso: string): Project {
  return {
    id,
    name,
    createdAt: nowIso,
    lastOpenedAt: nowIso,
    projectVersion: 1,
    dbSchemaVersion: 1,
    meta: {},
  };
}

export function projectToJson(project: Project): ProjectJsonV1 {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    lastOpenedAt: project.lastOpenedAt,
    version: project.projectVersion,
    dbSchemaVersion: project.dbSchemaVersion,
    meta: Object.keys(project.meta).length > 0 ? project.meta : undefined,
  };
}

export function projectFromJson(raw: unknown): Result<Project> {
  if (raw === null || typeof raw !== "object") {
    return { ok: false, error: { code: "INVALID_PROJECT_JSON", message: "Project JSON must be an object" } };
  }

  const value = raw as Partial<ProjectJsonV1>;

  if (!value.id || typeof value.id !== "string") {
    return { ok: false, error: { code: "INVALID_PROJECT_JSON", message: "Missing or invalid id" } };
  }

  if (!value.name || typeof value.name !== "string") {
    return { ok: false, error: { code: "INVALID_PROJECT_JSON", message: "Missing or invalid name" } };
  }

  if (!value.createdAt || typeof value.createdAt !== "string") {
    return { ok: false, error: { code: "INVALID_PROJECT_JSON", message: "Missing or invalid createdAt" } };
  }

  if (!value.lastOpenedAt || typeof value.lastOpenedAt !== "string") {
    return { ok: false, error: { code: "INVALID_PROJECT_JSON", message: "Missing or invalid lastOpenedAt" } };
  }

  if (typeof value.version !== "number") {
    return { ok: false, error: { code: "INVALID_PROJECT_JSON", message: "Missing or invalid version" } };
  }

  if (typeof value.dbSchemaVersion !== "number") {
    return { ok: false, error: { code: "INVALID_PROJECT_JSON", message: "Missing or invalid dbSchemaVersion" } };
  }

  const project: Project = {
    id: value.id as ProjectId,
    name: value.name,
    createdAt: value.createdAt,
    lastOpenedAt: value.lastOpenedAt,
    projectVersion: value.version,
    dbSchemaVersion: value.dbSchemaVersion,
    meta: value.meta ?? {},
  };

  return { ok: true, value: project };
}
