import type { Result } from "../../foundation/CoreTypes";
import type { ProjectId } from "../model/ProjectModel";
import type { DalContext, DbConnection } from "../../db/DalContext";
import type { StoragePaths } from "../StoragePaths";
import { executeReadMany, executeReadOne, executeWrite } from "../../db/DbHelpers";

export interface SimpleDalContext {
  run<T>(sql: string, params?: unknown[]): Promise<Result<T>>;
  all<T>(sql: string, params?: unknown[]): Promise<Result<T[]>>;
}

export async function createDalContextForProject(
  storagePaths: StoragePaths,
  projectId: ProjectId,
  dal: DalContext
): Promise<Result<SimpleDalContext>> {
  try {
    // Touch the project DB handle to ensure it is constructible; this also
    // validates the mapping from projectId to db path according to StoragePaths.
    const projectDb = dal.getProjectDb(projectId);
    const conn = await projectDb.getConnection();

    const makeSimple = (connection: DbConnection): SimpleDalContext => ({
      async run<T>(sql: string, params?: unknown[]): Promise<Result<T>> {
        try {
          const result = await executeWrite(connection, sql, params);
          return { ok: true, value: (result.raw as T) ?? (undefined as unknown as T) };
        } catch (error) {
          return {
            ok: false,
            error: {
              code: "DAL_RUN_FAILED",
              message: "Failed to execute write command",
              details: error,
            },
          };
        }
      },
      async all<T>(sql: string, params?: unknown[]): Promise<Result<T[]>> {
        try {
          const rows = await executeReadMany<T>(connection, sql, params);
          return { ok: true, value: [...rows] };
        } catch (error) {
          return {
            ok: false,
            error: {
              code: "DAL_ALL_FAILED",
              message: "Failed to execute read query",
              details: error,
            },
          };
        }
      },
    });

    return { ok: true, value: makeSimple(conn) };
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
