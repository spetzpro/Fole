import { CoreRuntime } from "../../src/core/CoreRuntime";
import { ProjectDb } from "../../src/core/ProjectDb";
import { createProjectMembershipService } from "../../src/core/ProjectMembershipService";

function assert(condition: unknown, message: string): void {
	if (!condition) {
		throw new Error(message);
	}
}

async function runProjectMembershipServiceTests(): Promise<void> {
	const runtime = new CoreRuntime({
		storageRoot: "/storage",
		useInMemoryDal: true,
		useDalLocks: true,
		lockDiagnosticsRepositoryCapacity: 10,
	});

	const projectId = "proj-1";
	const projectDb = new ProjectDb(runtime);
	const conn = await projectDb.getConnection(projectId);

	await conn.executeCommand({
		text: `CREATE TABLE IF NOT EXISTS project_members (
		  project_id TEXT NOT NULL,
		  user_id TEXT NOT NULL,
		  role_id TEXT NOT NULL
		)`,
		parameters: [],
	});

	const service = createProjectMembershipService(projectDb);

	// a) addOrUpdateMembership inserts a new membership
	{
		await service.addOrUpdateMembership(projectId, "user-1", "OWNER");
		const membership = await service.getMembership(projectId, "user-1");
		assert(membership !== null, "Expected membership for user-1 after addOrUpdateMembership");
		assert(membership!.projectId === projectId, "Expected projectId proj-1 for user-1");
		assert(membership!.roleId === "OWNER", "Expected roleId OWNER for user-1");
	}

	// b) addOrUpdateMembership updates an existing membership
	{
		await service.addOrUpdateMembership(projectId, "user-1", "VIEWER");
		await service.addOrUpdateMembership(projectId, "user-1", "EDITOR");
		const membership = await service.getMembership(projectId, "user-1");
		assert(membership !== null, "Expected membership for user-1 after update");
		assert(membership!.roleId === "EDITOR", "Expected roleId EDITOR for user-1 after update");

		// verify only one row exists for (project_id, user_id)
		const rows = await conn.executeQuery<{ count: number }>({
			text: "SELECT COUNT(*) as count FROM project_members WHERE project_id = ? AND user_id = ?",
			parameters: [projectId, "user-1"],
		});
		assert(rows.rows[0].count === 1, "Expected exactly one row for user-1 after updates");
	}

	// seed another membership via service for remove tests
	await service.addOrUpdateMembership(projectId, "user-2", "VIEWER");

	// c) removeMembership deletes membership
	{
		await service.addOrUpdateMembership(projectId, "user-3", "OWNER");
		let membership = await service.getMembership(projectId, "user-3");
		assert(membership !== null, "Expected membership for user-3 before removal");

		await service.removeMembership(projectId, "user-3");
		membership = await service.getMembership(projectId, "user-3");
		assert(membership === null, "Expected no membership for user-3 after removal");

		const user2Membership = await service.getMembership(projectId, "user-2");
		assert(user2Membership !== null, "Expected membership for user-2 to remain after removing user-3");
		assert(user2Membership!.roleId === "VIEWER", "Expected roleId VIEWER for user-2");
	}
}

runProjectMembershipServiceTests().catch((err) => {
	// eslint-disable-next-line no-console
	console.error("projectMembershipService tests failed", err);
	process.exitCode = 1;
});
