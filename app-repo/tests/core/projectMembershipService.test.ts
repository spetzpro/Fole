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

	await conn.executeCommand({
		text: "INSERT INTO project_members (project_id, user_id, role_id) VALUES (?, ?, ?)",
		parameters: [projectId, "user-1", "OWNER"],
	});

	await conn.executeCommand({
		text: "INSERT INTO project_members (project_id, user_id, role_id) VALUES (?, ?, ?)",
		parameters: [projectId, "user-2", "VIEWER"],
	});

	const service = createProjectMembershipService(projectDb);

	{
		const membership = await service.getMembership(projectId, "user-1");
		assert(membership !== null, "Expected membership for user-1");
		assert(membership!.projectId === projectId, "Expected projectId proj-1 for user-1");
		assert(membership!.roleId === "OWNER", "Expected roleId OWNER for user-1");
	}

	{
		const membership = await service.getMembership(projectId, "user-2");
		assert(membership !== null, "Expected membership for user-2");
		assert(membership!.projectId === projectId, "Expected projectId proj-1 for user-2");
		assert(membership!.roleId === "VIEWER", "Expected roleId VIEWER for user-2");
	}

	{
		const membership = await service.getMembership(projectId, "user-3");
		assert(membership === null, "Expected no membership for user-3");
	}

	{
		const membership = await service.getMembership("proj-2", "user-1");
		assert(membership === null, "Expected no membership for user-1 in proj-2");
	}
}

runProjectMembershipServiceTests().catch((err) => {
	// eslint-disable-next-line no-console
	console.error("projectMembershipService tests failed", err);
	process.exitCode = 1;
});
