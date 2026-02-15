import { randomUUID } from "crypto";
import type { ProjectDb } from "../../core/ProjectDb";

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

export interface CreateFileInput {
  id?: string;
  storageKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  metadata?: Record<string, unknown> | null;
  createdBy: string;
  createdAt?: string;
}

export interface FileRepository {
  create(projectId: string, input: CreateFileInput): Promise<FileRecord>;
  get(projectId: string, fileId: string): Promise<FileRecord | null>;
  list(projectId: string): Promise<readonly FileRecord[]>;
  delete(projectId: string, id: string): Promise<void>;
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export function createFileRepository(projectDb: ProjectDb): FileRepository {
  return {
    async create(projectId, input) {
      const conn = await projectDb.getConnection(projectId);
      const id = input.id ?? randomUUID();
      const createdAt = input.createdAt ?? new Date().toISOString();
      const metadataJson = input.metadata == null ? null : JSON.stringify(input.metadata);

      await conn.executeCommand({
        type: "insert",
        text: "INSERT INTO files (id, project_id, storage_key, filename, mime_type, size_bytes, metadata_json, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        parameters: [
          id,
          projectId,
          input.storageKey,
          input.filename,
          input.mimeType,
          input.sizeBytes,
          metadataJson,
          createdAt,
          input.createdBy,
        ],
      });

      return {
        id,
        projectId,
        storageKey: input.storageKey,
        filename: input.filename,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        metadata: input.metadata ?? null,
        createdAt,
        createdBy: input.createdBy,
      };
    },

    async get(projectId, fileId) {
      const conn = await projectDb.getConnection(projectId);
      const rows = await conn.executeQuery<{
        id: string;
        project_id: string;
        storage_key: string;
        filename: string;
        mime_type: string;
        size_bytes: number;
        metadata_json: string | null;
        created_at: string;
        created_by: string;
      }>({
        text: "SELECT id, project_id, storage_key, filename, mime_type, size_bytes, metadata_json, created_at, created_by FROM files WHERE project_id = ? AND id = ? LIMIT 1",
        parameters: [projectId, fileId],
      });

      const row = rows[0];
      if (!row) {
        return null;
      }

      return {
        id: row.id,
        projectId: row.project_id,
        storageKey: row.storage_key,
        filename: row.filename,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        metadata: parseJsonObject(row.metadata_json),
        createdAt: row.created_at,
        createdBy: row.created_by,
      };
    },

    async list(projectId) {
      const conn = await projectDb.getConnection(projectId);
      const rows = await conn.executeQuery<{
        id: string;
        project_id: string;
        storage_key: string;
        filename: string;
        mime_type: string;
        size_bytes: number;
        metadata_json: string | null;
        created_at: string;
        created_by: string;
      }>({
        text: "SELECT id, project_id, storage_key, filename, mime_type, size_bytes, metadata_json, created_at, created_by FROM files WHERE project_id = ? ORDER BY created_at ASC, id ASC",
        parameters: [projectId],
      });

      return rows.map((row) => ({
        id: row.id,
        projectId: row.project_id,
        storageKey: row.storage_key,
        filename: row.filename,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        metadata: parseJsonObject(row.metadata_json),
        createdAt: row.created_at,
        createdBy: row.created_by,
      }));
    },

    async delete(projectId, id) {
      const conn = await projectDb.getConnection(projectId);
      await conn.executeCommand({
        type: "delete",
        text: "DELETE FROM files WHERE id = ?",
        parameters: [id],
      });
    },
  };
}
