import type { ProjectDb } from "./ProjectDb";
import type { RoleId } from "./permissions/PermissionModel";
import type { ProjectMembershipService } from "./ProjectMembershipService";
import type { PermissionService } from "./permissions/PermissionService";
import type { ResourceDescriptor, PermissionContext } from "./permissions/PermissionModel";
import { buildProjectPermissionContextForCurrentUser } from "./permissions/PermissionGuards";

export interface ProjectMemberRecord {
	projectId: string;
	userId: string;
	roleId: RoleId;
}

export interface ProjectMemberManagementService {
	listMembers(projectId: string): Promise<ProjectMemberRecord[]>;
	addOrUpdateMember(projectId: string, targetUserId: string, roleId: RoleId): Promise<void>;
	removeMember(projectId: string, targetUserId: string): Promise<void>;
}

export interface SecuredProjectMemberManagementService {
	listMembers(projectId: string): Promise<ProjectMemberRecord[]>;
	addOrUpdateMember(projectId: string, targetUserId: string, roleId: RoleId): Promise<void>;
	removeMember(projectId: string, targetUserId: string): Promise<void>;
}

export function createProjectMemberManagementService(
	projectDb: ProjectDb,
	membershipService: ProjectMembershipService
): ProjectMemberManagementService {
	return {
		async listMembers(projectId: string): Promise<ProjectMemberRecord[]> {
			const conn = await projectDb.getConnection(projectId);
			const result = await conn.executeQuery<{
				project_id: string;
				user_id: string;
				role_id: string;
			}>(
				{
					text: "SELECT project_id, user_id, role_id FROM project_members WHERE project_id = ?",
					parameters: [projectId],
				}
			);

			return (result.rows || []).map((row) => ({
				projectId: row.project_id,
				userId: row.user_id,
				roleId: row.role_id as RoleId,
			}));
		},

		async addOrUpdateMember(projectId: string, targetUserId: string, roleId: RoleId): Promise<void> {
			await membershipService.addOrUpdateMembership(projectId, targetUserId, roleId);
		},

		async removeMember(projectId: string, targetUserId: string): Promise<void> {
			await membershipService.removeMembership(projectId, targetUserId);
		},
	};
}

export function createSecuredProjectMemberManagementService(
	base: ProjectMemberManagementService,
	membershipService: ProjectMembershipService,
	permissionService: PermissionService
): SecuredProjectMemberManagementService {
	async function ensureCanManageMembers(projectId: string): Promise<void> {
		const ctx: PermissionContext = await buildProjectPermissionContextForCurrentUser(
			projectId,
			membershipService
		);

		const resource: ResourceDescriptor = { type: "project", id: projectId, projectId };

		const decision = permissionService.canWithReason(ctx, "PROJECT_WRITE", resource);

		if (!decision.allowed) {
			const error = new Error("Forbidden: project.write required to manage project members");
			(error as any).code = "FORBIDDEN";
			throw error;
		}
	}

	return {
		async listMembers(projectId: string): Promise<ProjectMemberRecord[]> {
			await ensureCanManageMembers(projectId);
			return base.listMembers(projectId);
		},

		async addOrUpdateMember(projectId: string, targetUserId: string, roleId: RoleId): Promise<void> {
			await ensureCanManageMembers(projectId);
			return base.addOrUpdateMember(projectId, targetUserId, roleId);
		},

		async removeMember(projectId: string, targetUserId: string): Promise<void> {
			await ensureCanManageMembers(projectId);
			return base.removeMember(projectId, targetUserId);
		},
	};
}
