import type { ProjectDb } from "../../core/ProjectDb";
import type { ProjectMembershipService } from "../../core/ProjectMembershipService";
import { getPermissionService } from "../../core/permissions/PermissionService";
import { buildProjectPermissionContextForCurrentUser } from "../../core/permissions/PermissionGuards";
import type { PermissionDecision, ResourceDescriptor } from "../../core/permissions/PermissionModel";
import type { AppError, Result } from "../../core/foundation/CoreTypes";

export interface FileRecord {
  id: string;
  projectId: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  createdBy: string;
}

export interface FileServiceDependencies {
  projectDb: ProjectDb;
  membershipService: ProjectMembershipService;
}

export interface FileService {
  uploadFile(
    projectId: string,
    input: { name: string; contentType: string; sizeBytes: number }
  ): Promise<Result<{ fileId: string }, AppError>>;

  deleteFile(projectId: string, fileId: string): Promise<Result<void, AppError>>;
}

function toPermissionError(decision: PermissionDecision): Result<never, AppError> {
  return {
    ok: false,
    error: {
      code: "PERMISSION_DENIED",
      message: "Permission denied",
      details: {
        reasonCode: decision.reasonCode,
        grantSource: decision.grantSource,
      },
    },
  };
}

export function createFileService(deps: FileServiceDependencies): FileService {
  const { projectDb, membershipService } = deps;
  const permissionService = getPermissionService();

  return {
    async uploadFile(projectId, input) {
      const ctx = await buildProjectPermissionContextForCurrentUser(projectId, membershipService);

      const resource: ResourceDescriptor = {
        type: "file",
        id: "new", // logical new file placeholder
        projectId,
      };

      const decision = permissionService.canWithReason(ctx, "FILE_WRITE", resource);
      if (!decision.allowed) {
        return toPermissionError(decision);
      }

      const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const conn = await projectDb.getConnection(projectId);
      const now = new Date().toISOString();
      const createdBy = ctx.user?.id ?? "unknown";

      await conn.executeCommand({
        type: "insert",
        text:
          "INSERT INTO files (id, project_id, original_name, mime_type, size, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
        parameters: [
          fileId,
          projectId,
          input.name,
          input.contentType,
          input.sizeBytes,
          now,
          createdBy,
        ],
      });

      return { ok: true, value: { fileId } };
    },

    async deleteFile(projectId, fileId) {
      const conn = await projectDb.getConnection(projectId);

      const rows = await conn.executeQuery<{
        id: string;
        project_id: string;
        original_name: string;
        mime_type: string;
        size: number;
        created_at: string;
        created_by: string;
      }>({
        text:
          "SELECT id, project_id, original_name, mime_type, size, created_at, created_by FROM files WHERE id = ? LIMIT 1",
        parameters: [fileId],
      });

      if (!rows || rows.length === 0) {
        return {
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: "File not found",
          },
        };
      }

      const row = rows[0];

      const ctx = await buildProjectPermissionContextForCurrentUser(projectId, membershipService);

      const resource: ResourceDescriptor = {
        type: "file",
        id: row.id,
        projectId: row.project_id,
      };

      const decision = permissionService.canWithReason(ctx, "FILE_WRITE", resource);
      if (!decision.allowed) {
        return toPermissionError(decision);
      }

      await conn.executeCommand({
        type: "delete",
        text: "DELETE FROM files WHERE id = ?",
        parameters: [fileId],
      });

      return { ok: true, value: undefined };
    },
  };
}

// TODO: Wire the `files` table into real project.db migrations in a dedicated core.db migrations arc.
