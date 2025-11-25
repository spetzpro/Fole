import { initDefaultPolicies } from "../../src/core/permissions/PolicyRegistry";
import { getPermissionService } from "../../src/core/permissions/PermissionService";
import type {
	PermissionContext,
	ResourceDescriptor,
} from "../../src/core/permissions/PermissionModel";

function makeCtx(partial: Partial<PermissionContext>): PermissionContext {
	return {
		user: null,
		globalPermissions: [],
		...partial,
	} as PermissionContext;
}

function makeMapResource(projectId: string): ResourceDescriptor {
	return { type: "map", id: `map-${projectId}`, projectId };
}

function assert(condition: unknown, message: string): void {
	if (!condition) {
		throw new Error(message);
	}
}

function runMapCalibratePermissionTests(): void {
	initDefaultPolicies();

	const service = getPermissionService();

	// Project membership grant for map.calibrate
	{
		const ctx = makeCtx({
			user: { id: "u1", displayName: "User", roles: [] },
			projectMembership: {
				projectId: "p1",
				roleId: "OWNER",
				permissions: ["map.calibrate"],
			},
		});

		const decision = service.canWithReason(
			ctx,
			"MAP_CALIBRATE",
			makeMapResource("p1")
		);
		assert(decision.allowed, "Expected project membership to allow map.calibrate");
		assert(
			decision.grantSource === "project_membership",
			`Expected grantSource project_membership, got ${decision.grantSource}`
		);
	}

	// Global grant for map.calibrate
	{
		const ctx = makeCtx({
			user: { id: "u2", displayName: "GlobalUser", roles: [] },
			globalPermissions: ["map.calibrate"],
		});

		const decision = service.canWithReason(
			ctx,
			"MAP_CALIBRATE",
			makeMapResource("p2")
		);
		assert(decision.allowed, "Expected global permission to allow map.calibrate");
		assert(
			decision.grantSource === "global_permission",
			`Expected grantSource global_permission, got ${decision.grantSource}`
		);
	}

	// Override grant for map.calibrate
	{
		const ctx = makeCtx({
			user: { id: "u3", displayName: "OverrideUser", roles: [] },
			globalPermissions: ["map.calibrate.override"],
		});

		const decision = service.canWithReason(
			ctx,
			"MAP_CALIBRATE",
			makeMapResource("p3")
		);
		assert(decision.allowed, "Expected override permission to allow map.calibrate");
		assert(
			decision.grantSource === "override_permission",
			`Expected grantSource override_permission, got ${decision.grantSource}`
		);
	}
}

runMapCalibratePermissionTests();
