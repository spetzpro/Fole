import { randomUUID } from "crypto";
import type { ProjectDb } from "../../core/ProjectDb";

export interface CommentRecord {
	id: string;
	projectId: string;
	targetType: string;
	targetId: string;
	authorUserId: string;
	body: string;
	attachments: readonly string[];
	metadata: Record<string, unknown> | null;
	createdAt: string;
}

export interface CreateCommentInput {
	id?: string;
	targetType: string;
	targetId: string;
	authorUserId: string;
	body: string;
	attachments?: readonly string[];
	metadata?: Record<string, unknown> | null;
	createdAt?: string;
}

export interface CommentRepository {
	create(projectId: string, input: CreateCommentInput): Promise<CommentRecord>;
	get(projectId: string, commentId: string): Promise<CommentRecord | null>;
	listByTarget(projectId: string, targetType: string, targetId: string): Promise<readonly CommentRecord[]>;
	delete(projectId: string, id: string): Promise<void>;
}

function parseAttachments(value: string | null | undefined): readonly string[] {
	if (!value) {
		return [];
	}
	try {
		const parsed = JSON.parse(value);
		if (Array.isArray(parsed)) {
			return parsed.filter((entry): entry is string => typeof entry === "string");
		}
		return [];
	} catch {
		return [];
	}
}

function parseMetadata(value: string | null | undefined): Record<string, unknown> | null {
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

export function createCommentRepository(projectDb: ProjectDb): CommentRepository {
	return {
		async create(projectId, input) {
			const conn = await projectDb.getConnection(projectId);
			const id = input.id ?? randomUUID();
			const createdAt = input.createdAt ?? new Date().toISOString();
			const attachmentsJson = JSON.stringify(input.attachments ?? []);
			const metadataJson = input.metadata == null ? null : JSON.stringify(input.metadata);

			await conn.executeCommand({
				type: "insert",
				text: "INSERT INTO comments (id, project_id, target_type, target_id, author_user_id, body, attachments_json, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
				parameters: [
					id,
					projectId,
					input.targetType,
					input.targetId,
					input.authorUserId,
					input.body,
					attachmentsJson,
					metadataJson,
					createdAt,
				],
			});

			return {
				id,
				projectId,
				targetType: input.targetType,
				targetId: input.targetId,
				authorUserId: input.authorUserId,
				body: input.body,
				attachments: input.attachments ?? [],
				metadata: input.metadata ?? null,
				createdAt,
			};
		},

		async get(projectId, commentId) {
			const conn = await projectDb.getConnection(projectId);
			const rows = await conn.executeQuery<{
				id: string;
				project_id: string;
				target_type: string;
				target_id: string;
				author_user_id: string;
				body: string;
				attachments_json: string | null;
				metadata_json: string | null;
				created_at: string;
			}>({
				text: "SELECT id, project_id, target_type, target_id, author_user_id, body, attachments_json, metadata_json, created_at FROM comments WHERE project_id = ? AND id = ? LIMIT 1",
				parameters: [projectId, commentId],
			});

			const row = rows[0];
			if (!row) {
				return null;
			}

			return {
				id: row.id,
				projectId: row.project_id,
				targetType: row.target_type,
				targetId: row.target_id,
				authorUserId: row.author_user_id,
				body: row.body,
				attachments: parseAttachments(row.attachments_json),
				metadata: parseMetadata(row.metadata_json),
				createdAt: row.created_at,
			};
		},

		async listByTarget(projectId, targetType, targetId) {
			const conn = await projectDb.getConnection(projectId);
			const rows = await conn.executeQuery<{
				id: string;
				project_id: string;
				target_type: string;
				target_id: string;
				author_user_id: string;
				body: string;
				attachments_json: string | null;
				metadata_json: string | null;
				created_at: string;
			}>({
				text: "SELECT id, project_id, target_type, target_id, author_user_id, body, attachments_json, metadata_json, created_at FROM comments WHERE project_id = ? AND target_type = ? AND target_id = ? ORDER BY created_at ASC, id ASC",
				parameters: [projectId, targetType, targetId],
			});

			return rows.map((row) => ({
				id: row.id,
				projectId: row.project_id,
				targetType: row.target_type,
				targetId: row.target_id,
				authorUserId: row.author_user_id,
				body: row.body,
				attachments: parseAttachments(row.attachments_json),
				metadata: parseMetadata(row.metadata_json),
				createdAt: row.created_at,
			}));
		},
    
		async delete(projectId: string, id: string): Promise<void> {
			const conn = await projectDb.getConnection(projectId);
			await conn.executeCommand({
				type: "delete",
				text: "DELETE FROM comments WHERE id = ?",
				parameters: [id],
			});
		},
	};
}
