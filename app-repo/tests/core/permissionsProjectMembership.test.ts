import { initDefaultPolicies } from "../../src/core/permissions/PolicyRegistry";
import { getPermissionService } from "../../src/core/permissions/PermissionService";
import type { CurrentUser } from "../../src/core/permissions/PermissionModel";
import {
	createPermissionContextFromCurrentUser,
	createProjectPermissionContextForUser,
} from "../../src/core/permissions/PermissionGuards";

describe("core.permissions project membership behavior", () => {
	beforeAll(() => {
		initDefaultPolicies();
	});

	test("project membership grants project-scoped permissions", () => {
		const user: CurrentUser = {
			id: "user-1",
			displayName: "Owner User",
			roles: ["OWNER"],
		};

		const ctx = createProjectPermissionContextForUser(user, "proj-1", "OWNER");
		const service = getPermissionService();
		const decision = service.canWithReason(ctx, "MAP_EDIT", {
			type: "map",
			id: "map-1",
			projectId: "proj-1",
		});

		expect(decision.allowed).toBe(true);
		expect(decision.grantSource).toBe("project_membership");
	});

	test("RESOURCE_NOT_IN_PROJECT when projectId mismatch", () => {
		const user: CurrentUser = {
			id: "user-1",
			displayName: "Owner User",
			roles: ["OWNER"],
		};

		const ctx = createProjectPermissionContextForUser(user, "proj-1", "OWNER");
		const service = getPermissionService();
		const decision = service.canWithReason(ctx, "MAP_EDIT", {
			type: "map",
			id: "map-1",
			projectId: "proj-2",
		});

		expect(decision.allowed).toBe(false);
		expect(decision.reasonCode).toBe("RESOURCE_NOT_IN_PROJECT");
	});

	test("falls back to global permissions when no projectMembership", () => {
		const user: CurrentUser = {
			id: "user-2",
			displayName: "Global Editor",
			roles: ["EDITOR"],
		};

		const ctx = createPermissionContextFromCurrentUser();
		const service = getPermissionService();
		const decision = service.canWithReason(ctx, "MAP_EDIT", {
			type: "map",
			id: "map-2",
			projectId: "proj-3",
		});

		expect(decision.allowed).toBe(true);
		expect(decision.grantSource).toBe("global_permission");
	});
});
