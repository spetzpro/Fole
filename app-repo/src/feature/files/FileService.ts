import type { ProjectDb } from "../../core/ProjectDb";
import type { ProjectMembershipService } from "../../core/ProjectMembershipService";
import { getPermissionService } from "../../core/permissions/PermissionService";
import { buildProjectPermissionContextForCurrentUser } from "../../core/permissions/PermissionGuards";
import type { PermissionDecision, ResourceDescriptor } from "../../core/permissions/PermissionModel";
import type { AppError, Result } from "../../core/foundation/CoreTypes";
import { createFileRepository } from "./FileRepository";

export interface FileRecord {
  id: string;
  projectId: string;
  storageKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  metadata: Record<string, unknown> | null;
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
    input: { name: string; contentType: string; sizeBytes: number; storageKey?: string; metadata?: Record<string, unknown> | null }
  ): Promise<Result<{ fileId: string }, AppError>>;

  listFiles(projectId: string): Promise<Result<readonly FileRecord[], AppError>>;

  getFile(projectId: string, fileId: string): Promise<Result<FileRecord, AppError>>;

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
  const repository = createFileRepository(projectDb);

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

      const now = new Date().toISOString();
      const createdBy = ctx.user?.id ?? "unknown";

      const created = await repository.create(projectId, {
        storageKey: input.storageKey ?? `projects/${projectId}/files/${Date.now()}-${input.name}`,
        filename: input.name,
        mimeType: input.contentType,
        sizeBytes: input.sizeBytes,
        metadata: input.metadata ?? null,
        createdBy,
        createdAt: now,
      });

      return { ok: true, value: { fileId: created.id } };
    },

    async listFiles(projectId) {
      const ctx = await buildProjectPermissionContextForCurrentUser(projectId, membershipService);

      const decision = permissionService.canWithReason(ctx, "FILE_READ", {
        type: "file",
        id: "*",
        projectId,
      });

      if (!decision.allowed) {
        return toPermissionError(decision);
      }

      const rows = await repository.list(projectId);
      return { ok: true, value: rows };
    },

    async getFile(projectId, fileId) {
      const row = await repository.get(projectId, fileId);

      if (!row) {
        return {
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: "File not found",
          },
        };
      }

      const ctx = await buildProjectPermissionContextForCurrentUser(projectId, membershipService);

      const decision = permissionService.canWithReason(ctx, "FILE_READ", {
        type: "file",
        id: row.id,
        projectId: row.projectId,
      });

      if (!decision.allowed) {
        return toPermissionError(decision);
      }

      return { ok: true, value: row };
    },

    async deleteFile(projectId, fileId) {
      const file = await repository.get(projectId, fileId);

      if (!file) {
        return {
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: "File not found",
          },
        };
      }

      const ctx = await buildProjectPermissionContextForCurrentUser(projectId, membershipService);

      const resource: ResourceDescriptor = {
        type: "file",
        id: file.id,
        projectId: file.projectId,
      };

      const decision = permissionService.canWithReason(ctx, "FILE_WRITE", resource);
      if (!decision.allowed) {
        return toPermissionError(decision);
      }

      await repository.delete(projectId, fileId);

      return { ok: true, value: undefined };
    },
  };
}
