import { setCurrentUserProvider } from "../../src/core/auth/CurrentUserProvider";
import type { CurrentUser } from "../../src/core/auth/CurrentUserTypes";
import { initDefaultPolicies } from "../../src/core/permissions/PolicyRegistry";
import { getPermissionService } from "../../src/core/permissions/PermissionService";
import type { ProjectMembershipService } from "../../src/core/ProjectMembershipService";
import { buildProjectPermissionContextForCurrentUser } from "../../src/core/permissions/PermissionGuards";

function assert(condition: unknown, message: string): void {
	if (!condition) {
		throw new Error(message);
	}
}

class FakeCurrentUserProvider {
	constructor(private readonly user: CurrentUser | null) {}

	getCurrentUser(): CurrentUser | null {
		return this.user;
	}

	isAuthenticated(): boolean {
		return this.user !== null;
	}
}

class FakeProjectMembershipService implements ProjectMembershipService {
	constructor(private readonly records: Record<string, { projectId: string; roleId: string }>) {}

	async getMembership(projectId: string, userId: string) {
		const key = `${projectId}:${userId}`;
		const record = this.records[key];
		return record ? { projectId: record.projectId, roleId: record.roleId } : null;
	}
}

async function runProjectPermissionContextBuilderTests(): Promise<void> {
	initDefaultPolicies();
	const service = getPermissionService();

	// a) unauthenticated user
	{
		setCurrentUserProvider(new FakeCurrentUserProvider(null));
		const membershipService = new FakeProjectMembershipService({});
		const ctx = await buildProjectPermissionContextForCurrentUser("proj-1", membershipService);

		assert(ctx.user === null, "Expected user to be null when unauthenticated");
		assert(ctx.globalPermissions.length === 0, "Expected no global permissions when unauthenticated");
		assert(ctx.projectMembership === undefined, "Expected no projectMembership when unauthenticated");
	}

	// b) membership exists → project_membership grantSource
	{
		const user: CurrentUser = {
			id: "user-1",
			displayName: "Owner User",
			roles: ["OWNER"],
		};
		setCurrentUserProvider(new FakeCurrentUserProvider(user));
		const membershipService = new FakeProjectMembershipService({
			"proj-1:user-1": { projectId: "proj-1", roleId: "OWNER" },
		});

		const ctx = await buildProjectPermissionContextForCurrentUser("proj-1", membershipService);
		assert(ctx.user !== null, "Expected non-null user when authenticated");
		assert(ctx.projectMembership !== undefined, "Expected projectMembership to be set when membership exists");
		assert(
			ctx.projectMembership!.projectId === "proj-1",
			"Expected projectMembership.projectId to match requested projectId",
		);

		const decision = service.canWithReason(ctx, "MAP_EDIT", {
			type: "map",
			id: "map-1",
			projectId: "proj-1",
		});

		assert(decision.allowed, "Expected MAP_EDIT to be allowed via project membership");
		assert(
			decision.grantSource === "project_membership",
			`Expected grantSource project_membership, got ${decision.grantSource}`,
		);
	}

	// c) no membership → projectMembership undefined
	{
		const user: CurrentUser = {
			id: "user-2",
			displayName: "Viewer User",
			roles: ["VIEWER"],
		};
		setCurrentUserProvider(new FakeCurrentUserProvider(user));
		const membershipService = new FakeProjectMembershipService({});

		const ctx = await buildProjectPermissionContextForCurrentUser("proj-1", membershipService);
		assert(ctx.user !== null, "Expected non-null user when authenticated");
		assert(
			ctx.projectMembership === undefined,
			"Expected projectMembership to be undefined when no membership exists",
		);
	}

	// d) RESOURCE_NOT_IN_PROJECT when resource.projectId mismatches membership.projectId
	{
		const user: CurrentUser = {
			id: "user-3",
			displayName: "Owner User",
			roles: ["OWNER"],
		};
		setCurrentUserProvider(new FakeCurrentUserProvider(user));
		const membershipService = new FakeProjectMembershipService({
			"proj-1:user-3": { projectId: "proj-1", roleId: "OWNER" },
		});

		const ctx = await buildProjectPermissionContextForCurrentUser("proj-1", membershipService);
		const decision = service.canWithReason(ctx, "MAP_EDIT", {
			type: "map",
			id: "map-1",
			projectId: "other-proj",
		});

		assert(!decision.allowed, "Expected MAP_EDIT to be denied for mismatched projectId");
		assert(
			decision.reasonCode === "RESOURCE_NOT_IN_PROJECT",
			`Expected reason RESOURCE_NOT_IN_PROJECT, got ${decision.reasonCode}`,
		);
	}
}

runProjectPermissionContextBuilderTests().catch((err) => {
	// eslint-disable-next-line no-console
	console.error("projectPermissionContextBuilder tests failed", err);
	process.exitCode = 1;
});
