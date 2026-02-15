import { randomUUID } from "crypto";
import type { ProjectDb } from "../../core/ProjectDb";
import { createProjectMembershipService, type ProjectMembershipService } from "../../core/ProjectMembershipService";
import { buildProjectPermissionContextForCurrentUser } from "../../core/permissions/PermissionGuards";
import { getPermissionService } from "../../core/permissions/PermissionService";
import type { Result, AppError } from "../../core/foundation/CoreTypes";
import { getCurrentUserProvider } from "../../core/auth/CurrentUserProvider";
import { createCommentRepository } from "./CommentRepository";

export interface CreateCommentInput {
	targetType: string;
	targetId: string;
	body: string;
	attachments?: readonly string[];
	metadata?: Record<string, unknown> | null;
}

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

export interface CommentsServiceDependencies {
	projectDb: ProjectDb;
	membershipService?: ProjectMembershipService;
}

export interface CommentsService {
	createComment(projectId: string, input: CreateCommentInput): Promise<Result<{ commentId: string }, AppError>>;
	createCommentRecord(projectId: string, input: CreateCommentInput): Promise<Result<CommentRecord, AppError>>;
	listComments(projectId: string, targetType: string, targetId: string): Promise<Result<readonly CommentRecord[], AppError>>;
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
	const repository = createCommentRepository(deps.projectDb);

	return {
		async createComment(projectId, input) {
			const createResult = await this.createCommentRecord(projectId, input);
			if (!createResult.ok) {
				return createResult;
			}

			return { ok: true, value: { commentId: createResult.value.id } };
		},

		async createCommentRecord(projectId, input) {
			const ctx = await buildProjectPermissionContextForCurrentUser(projectId, membershipService);

			// MVP underlying-resource read gate: PROJECT_READ on the project.
			// TODO: refine to feature-level read per anchor type (map/file/sketch/etc.) in future arcs.
			const projectReadDecision = await permissionService.canWithReason(ctx, "PROJECT_READ", {
				type: "project",
				id: projectId,
				projectId,
			});

			if (!projectReadDecision.allowed) {
				return toPermissionError(projectReadDecision.reasonCode, projectReadDecision.grantSource);
			}

			const createDecision = await permissionService.canWithReason(ctx, "COMMENT_CREATE", {
				type: "comment",
				id: "new",
				projectId,
			});

			if (!createDecision.allowed) {
				return toPermissionError(createDecision.reasonCode, createDecision.grantSource);
			}

			const id = randomUUID();
			const now = new Date().toISOString();
			// NOTE: createdBy is taken from the current user provider.
			const currentUserProvider = getCurrentUserProvider();
			const currentUser = currentUserProvider?.getCurrentUser() ?? null;
			const authorUserId = currentUser?.id ?? "unknown";

			const created = await repository.create(projectId, {
				id,
				targetType: input.targetType,
				targetId: input.targetId,
				authorUserId,
				body: input.body,
				attachments: input.attachments,
				metadata: input.metadata ?? null,
				createdAt: now,
			});

			return { ok: true, value: created };
		},

		async listComments(projectId, targetType, targetId) {
			const ctx = await buildProjectPermissionContextForCurrentUser(projectId, membershipService);

			const projectReadDecision = await permissionService.canWithReason(ctx, "PROJECT_READ", {
				type: "project",
				id: projectId,
				projectId,
			});

			if (!projectReadDecision.allowed) {
				return toPermissionError(projectReadDecision.reasonCode, projectReadDecision.grantSource);
			}

			const rows = await repository.listByTarget(projectId, targetType, targetId);
			return { ok: true, value: rows };
		},

		async deleteComment(projectId, commentId) {
			const row = await repository.get(projectId, commentId);

			if (!row) {
				return {
					ok: false,
					error: {
						code: "NOT_FOUND",
						message: "Comment not found",
					},
				};
			}

			const ctx = await buildProjectPermissionContextForCurrentUser(projectId, membershipService);

			const decision = await permissionService.canWithReason(ctx, "COMMENT_DELETE", {
				type: "comment",
				id: row.id,
				projectId: row.projectId,
			});

			if (!decision.allowed) {
				return toPermissionError(decision.reasonCode, decision.grantSource);
			}

			await repository.delete(projectId, commentId);

			return { ok: true, value: undefined };
		},
	};
}
