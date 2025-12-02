import { randomUUID } from "crypto";
import type { ProjectDb } from "../../core/ProjectDb";
import { createProjectMembershipService, type ProjectMembershipService } from "../../core/ProjectMembershipService";
import { buildProjectPermissionContextForCurrentUser } from "../../core/permissions/PermissionGuards";
import { getPermissionService } from "../../core/permissions/PermissionService";
import type { Result, AppError } from "../../core/foundation/CoreTypes";
import { getCurrentUserProvider } from "../../core/auth/CurrentUserProvider";

export interface CreateCommentInput {
	anchorType: string;
	anchorId: string;
	body: string;
}

export interface CommentRecord {
	id: string;
	projectId: string;
	anchorType: string;
	anchorId: string;
	body: string;
	createdAt: string;
	createdBy: string;
}

export interface CommentsServiceDependencies {
	projectDb: ProjectDb;
	membershipService?: ProjectMembershipService;
}

export interface CommentsService {
	createComment(projectId: string, input: CreateCommentInput): Promise<Result<{ commentId: string }, AppError>>;
	deleteComment(projectId: string, commentId: string): Promise<Result<void, AppError>>;
}

function toPermissionError(reasonCode: string | undefined, grantSource: string | undefined): Result<never, AppError> {
	return {
		ok: false,
		error: {
			code: "PERMISSION_DENIED",
			message: "Permission denied",
			details: { reasonCode, grantSource },
		},
	};
}

export function createCommentsService(deps: CommentsServiceDependencies): CommentsService {
	const membershipService = deps.membershipService ?? createProjectMembershipService(deps.projectDb);
	const permissionService = getPermissionService();

	return {
		async createComment(projectId, input) {
			const ctx = await buildProjectPermissionContextForCurrentUser(projectId, membershipService);

			// MVP underlying-resource read gate: PROJECT_READ on the project.
			// TODO: refine to feature-level read per anchor type (map/file/sketch/etc.) in future arcs.
			const projectReadDecision = await permissionService.canWithReason("PROJECT_READ", {
				type: "project",
				id: projectId,
				projectId,
			});

			if (!projectReadDecision.allowed) {
				return toPermissionError(projectReadDecision.reasonCode, projectReadDecision.grantSource);
			}

			const createDecision = await permissionService.canWithReason("COMMENT_CREATE", {
				type: "comment",
				id: "new",
				projectId,
			});

			if (!createDecision.allowed) {
				return toPermissionError(createDecision.reasonCode, createDecision.grantSource);
			}

			const conn = await deps.projectDb.getConnection(projectId);

			const id = randomUUID();
			const now = new Date().toISOString();
			// NOTE: createdBy is taken from the current user provider.
			const currentUserProvider = getCurrentUserProvider();
			const currentUser = currentUserProvider?.getCurrentUser() ?? null;
			const createdBy = currentUser?.id ?? "unknown";

			await conn.executeCommand({
				type: "insert",
				text:
					"INSERT INTO comments (id, project_id, anchor_type, anchor_id, body, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
				parameters: [id, projectId, input.anchorType, input.anchorId, input.body, now, createdBy],
			});

			return { ok: true, value: { commentId: id } };
		},

		async deleteComment(projectId, commentId) {
			const conn = await deps.projectDb.getConnection(projectId);
			const rows = await conn.executeQuery<{
				id: string;
				project_id: string;
				anchor_type: string;
				anchor_id: string;
				body: string;
				created_at: string;
				created_by: string;
			}>(
				{
					text:
						"SELECT id, project_id, anchor_type, anchor_id, body, created_at, created_by FROM comments WHERE id = ? LIMIT 1",
					parameters: [commentId],
				}
			);

			if (!rows || rows.length === 0) {
				return {
					ok: false,
					error: {
						code: "NOT_FOUND",
						message: "Comment not found",
					},
				};
			}

			const row = rows[0];

			const ctx = await buildProjectPermissionContextForCurrentUser(projectId, membershipService);

			const decision = await permissionService.canWithReason("COMMENT_DELETE", {
				type: "comment",
				id: row.id,
				projectId: row.project_id,
			});

			if (!decision.allowed) {
				return toPermissionError(decision.reasonCode, decision.grantSource);
			}

			await conn.executeCommand({
				type: "delete",
				text: "DELETE FROM comments WHERE id = ?",
				parameters: [commentId],
			});

			return { ok: true, value: undefined };
		},
	};
}
