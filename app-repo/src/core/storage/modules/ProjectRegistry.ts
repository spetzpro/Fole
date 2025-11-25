import { promises as fs } from "fs";
import { createNewProject, projectFromJson, projectToJson, type Project, type ProjectId } from "../model/ProjectModel";
import type { Result } from "../../foundation/CoreTypes";
import type { ProjectPathResolver } from "./ProjectPathResolver";

export interface ProjectRegistry {
  listProjects(): Promise<Result<Project[]>>;
  getProjectById(id: ProjectId): Promise<Result<Project | null>>;
  createProject(name: string): Promise<Result<Project>>;
  openProject(id: ProjectId): Promise<Result<Project>>;
}

export function createProjectRegistry(pathResolver: ProjectPathResolver): ProjectRegistry {
  return {
    async listProjects(): Promise<Result<Project[]>> {
      try {
        const projectsRoot = pathResolver.getProjectsRoot();
        const entries = await fs.readdir(projectsRoot, { withFileTypes: true });
        const projects: Project[] = [];

        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const projectId = entry.name as ProjectId;
          const { projectJsonPath } = pathResolver.getProjectPaths(projectId);
          try {
            const raw = await fs.readFile(projectJsonPath, "utf8");
            const parsed = JSON.parse(raw);
            const result = projectFromJson(parsed);
            if (result.ok) {
              projects.push(result.value);
            }
          } catch {
            // Ignore malformed or missing project.json for listing purposes
          }
        }

        return { ok: true, value: projects };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: "PROJECT_LIST_FAILED",
            message: "Failed to list projects",
            details: error,
          },
        };
      }
    },

    async getProjectById(id: ProjectId): Promise<Result<Project | null>> {
      try {
        const { projectJsonPath } = pathResolver.getProjectPaths(id);
        const raw = await fs.readFile(projectJsonPath, "utf8");
        const parsed = JSON.parse(raw);
        const result = projectFromJson(parsed);
        if (!result.ok) {
          return { ok: false, error: result.error };
        }
        return { ok: true, value: result.value };
      } catch (error: any) {
        if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
          return { ok: true, value: null };
        }
        return {
          ok: false,
          error: {
            code: "PROJECT_READ_FAILED",
            message: "Failed to read project",
            details: error,
          },
        };
      }
    },

    async createProject(name: string): Promise<Result<Project>> {
      const nowIso = new Date().toISOString();
      const rawId = createRandomId();
      const id = rawId as ProjectId;
      const project = createNewProject(id, name, nowIso);
      const { rootDir, projectJsonPath, dbPath, filesDir, tmpDir } = pathResolver.getProjectPaths(id);

      try {
        await fs.mkdir(rootDir, { recursive: true });
        await fs.mkdir(filesDir, { recursive: true });
        await fs.mkdir(tmpDir, { recursive: true });

        const json = JSON.stringify(projectToJson(project), null, 2);
        await fs.writeFile(projectJsonPath, json, "utf8");

        // Ensure the DB file exists; actual schema migrations are handled elsewhere.
        await fs.writeFile(dbPath, "", { flag: "a" });

        return { ok: true, value: project };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: "PROJECT_CREATE_FAILED",
            message: "Failed to create project",
            details: error,
          },
        };
      }
    },

    async openProject(id: ProjectId): Promise<Result<Project>> {
      const existing = await this.getProjectById(id);
      if (!existing.ok) {
        return existing;
      }
      if (!existing.value) {
        return {
          ok: false,
          error: {
            code: "PROJECT_NOT_FOUND",
            message: "Project not found",
            details: { id },
          },
        };
      }

      const project = { ...existing.value, lastOpenedAt: new Date().toISOString() };
      const { projectJsonPath } = pathResolver.getProjectPaths(id);

      try {
        const json = JSON.stringify(projectToJson(project), null, 2);
        await fs.writeFile(projectJsonPath, json, "utf8");
        return { ok: true, value: project };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: "PROJECT_OPEN_FAILED",
            message: "Failed to update project lastOpenedAt",
            details: error,
          },
        };
      }
    },
  };
}

function createRandomId(): string {
  // Simple random id helper; can be replaced with a stable UUID strategy later.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
