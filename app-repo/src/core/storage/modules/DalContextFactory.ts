import type { Result } from "../../foundation/CoreTypes";
import type { ProjectId } from "../model/ProjectModel";
import type { DalContext } from "../../db/DalContext";
import { SqliteDalContext } from "../../db/SqliteDalContext";
import type { StoragePaths } from "../StoragePaths";

export interface SimpleDalContext {
  run<T>(sql: string, params?: unknown[]): Promise<Result<T>>;
  all<T>(sql: string, params?: unknown[]): Promise<Result<T[]>>;
}

export function createDalContextForProject(
  storagePaths: StoragePaths,
  projectId: ProjectId
): Result<DalContext> {
  try {
    const projectPaths = storagePaths.getProjectPaths(projectId);
    const engineConfig = { dbPath: projectPaths.projectDbPath } as any;
    const dal = new SqliteDalContext(storagePaths);
    return { ok: true, value: dal };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "DAL_CONTEXT_CREATE_FAILED",
        message: "Failed to create DAL context for project",
        details: error,
      },
    };
  }
}
