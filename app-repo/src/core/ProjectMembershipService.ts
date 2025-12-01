import type { ProjectDb } from "./ProjectDb";
import type { RoleId } from "./permissions/PermissionModel";

export interface ProjectMembershipRecord {
	projectId: string;
	roleId: RoleId;
}

export interface ProjectMembershipService {
	getMembership(projectId: string, userId: string): Promise<ProjectMembershipRecord | null>;
	addOrUpdateMembership(projectId: string, userId: string, roleId: RoleId): Promise<void>;
	removeMembership(projectId: string, userId: string): Promise<void>;
}

export function createProjectMembershipService(projectDb: ProjectDb): ProjectMembershipService {
	return {
		async getMembership(projectId: string, userId: string): Promise<ProjectMembershipRecord | null> {
			const conn = await projectDb.getConnection(projectId);

			const rows = await conn.executeQuery<{ project_id: string; user_id: string; role_id: string }>(
				{
					text: "SELECT project_id, user_id, role_id FROM project_members WHERE project_id = ? AND user_id = ? LIMIT 1",
					parameters: [projectId, userId],
				}
			);

			if (!rows || rows.length === 0) {
				return null;
			}

			const row = rows[0];

			return {
				projectId: row.project_id,
				roleId: row.role_id as RoleId,
			};
		},

		async addOrUpdateMembership(projectId: string, userId: string, roleId: RoleId): Promise<void> {
			const conn = await projectDb.getConnection(projectId);

			await conn.executeCommand({
				type: "delete",
				text: "DELETE FROM project_members WHERE project_id = ? AND user_id = ?",
				parameters: [projectId, userId],
			});

			await conn.executeCommand({
				type: "insert",
				text: "INSERT INTO project_members (project_id, user_id, role_id) VALUES (?, ?, ?)",
				parameters: [projectId, userId, roleId],
			});
		},

		async removeMembership(projectId: string, userId: string): Promise<void> {
			const conn = await projectDb.getConnection(projectId);
			await conn.executeCommand({
				type: "delete",
				text: "DELETE FROM project_members WHERE project_id = ? AND user_id = ?",
				parameters: [projectId, userId],
			});
		},
	};
}
