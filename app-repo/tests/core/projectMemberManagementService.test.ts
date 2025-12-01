import { CoreRuntime } from "../../src/core/CoreRuntime";
import { ProjectDb } from "../../src/core/ProjectDb";
import { createProjectMembershipService } from "../../src/core/ProjectMembershipService";
import {
	createProjectMemberManagementService,
	createSecuredProjectMemberManagementService,
} from "../../src/core/ProjectMemberManagementService";
import { initDefaultPolicies } from "../../src/core/permissions/PolicyRegistry";
import { getPermissionService } from "../../src/core/permissions/PermissionService";
import { getCurrentUserProvider, setCurrentUserProvider } from "../../src/core/auth/CurrentUserProvider";
import type { CurrentUser } from "../../src/core/auth/CurrentUserTypes";

function assert(condition: unknown, message: string): void {
	if (!condition) {
		throw new Error(message);
	}
}

class TestCurrentUserProvider {
	constructor(private user: CurrentUser | null) {}

	getCurrentUser(): CurrentUser | null {
		return this.user;
	}

	isAuthenticated(): boolean {
		return this.user != null;
	}
}

async function setup(projectId: string) {
	const runtime = new CoreRuntime({
		storageRoot: "/storage",
		useInMemoryDal: true,
		useDalLocks: true,
		lockDiagnosticsRepositoryCapacity: 10,
	});

	const projectDb = new ProjectDb(runtime);
	const projectMembershipService = createProjectMembershipService(projectDb);

	const conn = await projectDb.getConnection(projectId);
	await conn.executeCommand({
		text: `CREATE TABLE IF NOT EXISTS project_members (
		  project_id TEXT NOT NULL,
		  user_id TEXT NOT NULL,
		  role_id TEXT NOT NULL
		)`,
		parameters: [],
	});

	initDefaultPolicies();
	const permissionService = getPermissionService();

	const baseService = createProjectMemberManagementService(projectDb, projectMembershipService);
	const securedService = createSecuredProjectMemberManagementService(
		baseService,
		projectMembershipService,
		permissionService
	);

	return { projectDb, projectMembershipService, baseService, securedService };
}

async function runProjectMemberManagementServiceTests(): Promise<void> {
	const projectId = "proj-members";
	const { projectMembershipService, baseService, securedService } = await setup(projectId);

	// a) Owner can add and list members
	{
		await projectMembershipService.addOrUpdateMembership(projectId, "user-owner", "OWNER");

		const ownerUser: CurrentUser = {
			id: "user-owner",
			displayName: "Owner User",
			roles: ["OWNER"],
		};
		setCurrentUserProvider(new TestCurrentUserProvider(ownerUser));

		await securedService.addOrUpdateMember(projectId, "user-new", "VIEWER");

		const membership = await projectMembershipService.getMembership(projectId, "user-new");
		assert(membership !== null, "Expected membership for user-new after addOrUpdateMember");
		assert(membership!.roleId === "VIEWER", "Expected roleId VIEWER for user-new");

		const members = await securedService.listMembers(projectId);
		const hasNew = members.some((m) => m.userId === "user-new" && m.roleId === "VIEWER");
		assert(hasNew, "Expected listMembers to include user-new with VIEWER role");
	}

	// b) Viewer cannot add members
	{
		await projectMembershipService.addOrUpdateMembership(projectId, "user-viewer", "VIEWER");

		const viewerUser: CurrentUser = {
			id: "user-viewer",
			displayName: "Viewer User",
			roles: ["VIEWER"],
		};
		setCurrentUserProvider(new TestCurrentUserProvider(viewerUser));

		let threw = false;
		try {
			await securedService.addOrUpdateMember(projectId, "user-new-2", "VIEWER");
		} catch (err: any) {
			threw = true;
			assert((err as any).code === "FORBIDDEN", "Expected FORBIDDEN error for viewer addOrUpdateMember");
		}
		assert(threw, "Expected viewer addOrUpdateMember to throw");

		const membership = await projectMembershipService.getMembership(projectId, "user-new-2");
		assert(membership === null, "Expected no membership for user-new-2 after forbidden addOrUpdateMember");
	}

	// c) Owner can remove members
	{
		await projectMembershipService.addOrUpdateMembership(projectId, "user-owner", "OWNER");
		await projectMembershipService.addOrUpdateMembership(projectId, "user-to-remove", "VIEWER");

		const ownerUser: CurrentUser = {
			id: "user-owner",
			displayName: "Owner User",
			roles: ["OWNER"],
		};
		setCurrentUserProvider(new TestCurrentUserProvider(ownerUser));

		await securedService.removeMember(projectId, "user-to-remove");

		const membership = await projectMembershipService.getMembership(projectId, "user-to-remove");
		assert(membership === null, "Expected no membership for user-to-remove after removal");
	}

	// d) Non-member cannot manage membership
	{
		await projectMembershipService.addOrUpdateMembership(projectId, "user-owner", "OWNER");

		const outsider: CurrentUser = {
			id: "user-outside",
			displayName: "Outside User",
			roles: ["EDITOR"],
		};
		setCurrentUserProvider(new TestCurrentUserProvider(outsider));

		let threw = false;
		try {
			await securedService.addOrUpdateMember(projectId, "user-new-3", "VIEWER");
		} catch (err: any) {
			threw = true;
			assert((err as any).code === "FORBIDDEN", "Expected FORBIDDEN for non-member addOrUpdateMember");
		}
		assert(threw, "Expected non-member addOrUpdateMember to throw");
	}
}

runProjectMemberManagementServiceTests().catch((err) => {
	// eslint-disable-next-line no-console
	console.error("projectMemberManagementService tests failed", err);
	process.exitCode = 1;
});
