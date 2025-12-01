import type { ProjectDb } from "./ProjectDb";
import type { RoleId } from "./permissions/PermissionModel";

export interface ProjectMembershipRecord {
	projectId: string;
	roleId: RoleId;
}

export interface ProjectMembershipService {
	getMembership(projectId: string, userId: string): Promise<ProjectMembershipRecord | null>;
}

export function createProjectMembershipService(projectDb: ProjectDb): ProjectMembershipService {
	return {
		async getMembership(projectId: string, userId: string): Promise<ProjectMembershipRecord | null> {
			const conn = await projectDb.getConnection(projectId);

			const result = await conn.executeQuery<{ project_id: string; user_id: string; role_id: string }>(
				{
					text: "SELECT project_id, user_id, role_id FROM project_members WHERE project_id = ? AND user_id = ? LIMIT 1",
					parameters: [projectId, userId],
				}
			);

			if (!result.rows || result.rows.length === 0) {
				return null;
			}

			const row = result.rows[0];

			return {
				projectId: row.project_id,
				roleId: row.role_id as RoleId,
			};
		},
	};
}
