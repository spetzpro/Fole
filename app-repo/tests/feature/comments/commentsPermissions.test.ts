import * as fs from "fs";
import * as path from "path";
import { CoreRuntime } from "../../src/core/CoreRuntime";
import { ProjectDb } from "../../src/core/ProjectDb";
import { createProjectMembershipService } from "../../src/core/ProjectMembershipService";
import { createCommentsService } from "../../src/feature/comments/CommentsService";
import { initDefaultPolicies } from "../../src/core/permissions/PolicyRegistry";
import { getPermissionService } from "../../src/core/permissions/PermissionService";
import { setCurrentUserProvider, type CurrentUserProvider } from "../../src/core/auth/CurrentUserProvider";
import type { CurrentUser } from "../../src/core/auth/CurrentUserTypes";

function assert(condition: unknown, message: string): void {
	if (!condition) {
		throw new Error(message);
	}
}

class TestCurrentUserProvider implements CurrentUserProvider {
	constructor(private readonly user: CurrentUser | null) {}

	getCurrentUser(): CurrentUser | null {
		return this.user;
	}

	isAuthenticated(): boolean {
		return this.user != null;
	}
}

function makeTempRoot(): string {
	const base = path.join(process.cwd(), "tmp-comments-permissions-tests");
	if (!fs.existsSync(base)) {
		fs.mkdirSync(base, { recursive: true });
	}
	return base;
}

async function setup(projectId: string) {
	const root = makeTempRoot();
	const projectsRoot = path.join(root, "projects");
	if (!fs.existsSync(projectsRoot)) {
		fs.mkdirSync(projectsRoot, { recursive: true });
	}

	const runtime = new CoreRuntime({
		storageRoot: root,
		useInMemoryDal: true,
		useDalLocks: true,
		lockDiagnosticsRepositoryCapacity: 10,
	});

	const projectDb = new ProjectDb(runtime);
	const membershipService = createProjectMembershipService(projectDb);

	const conn = await projectDb.getConnection(projectId);
	await conn.executeCommand({
		type: "ddl",
		text: `CREATE TABLE IF NOT EXISTS project_members (
		  project_id TEXT NOT NULL,
		  user_id TEXT NOT NULL,
		  role_id TEXT NOT NULL
		)` ,
		parameters: [],
	});

	await conn.executeCommand({
		type: "ddl",
		text: `CREATE TABLE IF NOT EXISTS comments (
		  id TEXT PRIMARY KEY,
		  project_id TEXT NOT NULL,
		  anchor_type TEXT NOT NULL,
		  anchor_id TEXT NOT NULL,
		  body TEXT NOT NULL,
		  created_at TEXT NOT NULL,
		  created_by TEXT NOT NULL
		)` ,
		parameters: [],
	});

	initDefaultPolicies();
	const permissionService = getPermissionService();
	const commentsService = createCommentsService({ projectDb, membershipService });

	return { root, projectsRoot, membershipService, permissionService, commentsService };
}

async function runCommentsPermissionsTests(): Promise<void> {
	const projectId = "proj-comments-permissions";
	const { membershipService, commentsService } = await setup(projectId);

	// OWNER with membership can create and delete
	{
		await membershipService.addOrUpdateMembership(projectId, "user-owner", "OWNER");

		const ownerUser: CurrentUser = {
			id: "user-owner",
			displayName: "Owner User",
			roles: ["OWNER"],
		};
		setCurrentUserProvider(new TestCurrentUserProvider(ownerUser));

		const createResult = await commentsService.createComment(projectId, {
			anchorType: "map",
			anchorId: "map-1",
			body: "Owner comment",
		});
		assert(createResult.ok, "owner create should succeed");
		const commentId = createResult.value.commentId;

		const deleteResult = await commentsService.deleteComment(projectId, commentId);
		assert(deleteResult.ok, "owner delete should succeed");
	}

	// EDITOR with membership can create and delete
	{
		await membershipService.addOrUpdateMembership(projectId, "user-editor", "EDITOR");

		const editorUser: CurrentUser = {
			id: "user-editor",
			displayName: "Editor User",
			roles: ["EDITOR"],
		};
		setCurrentUserProvider(new TestCurrentUserProvider(editorUser));

		const createResult = await commentsService.createComment(projectId, {
			anchorType: "map",
			anchorId: "map-2",
			body: "Editor comment",
		});
		assert(createResult.ok, "editor create should succeed");
		const commentId = createResult.value.commentId;

		const deleteResult = await commentsService.deleteComment(projectId, commentId);
		assert(deleteResult.ok, "editor delete should succeed");
	}

	// VIEWER with membership is denied create/delete
	{
		await membershipService.addOrUpdateMembership(projectId, "user-viewer", "VIEWER");

		const viewerUser: CurrentUser = {
			id: "user-viewer",
			displayName: "Viewer User",
			roles: ["VIEWER"],
		};
		setCurrentUserProvider(new TestCurrentUserProvider(viewerUser));

		const createResult = await commentsService.createComment(projectId, {
			anchorType: "map",
			anchorId: "map-3",
			body: "Viewer comment",
		});
		assert(!createResult.ok, "viewer create should be denied");
		if (!createResult.ok) {
			assert(createResult.error.code === "PERMISSION_DENIED", "viewer create should use PERMISSION_DENIED");
			const reasonCode = (createResult.error.details as any)?.reasonCode;
			assert(typeof reasonCode === "string" && reasonCode.length > 0, "viewer create reasonCode should be non-empty");
		}

		// Attempt to delete a nonexistent comment should still be handled gracefully (NOT_FOUND or PERMISSION_DENIED).
		const deleteResult = await commentsService.deleteComment(projectId, "nonexistent-comment");
		if (!deleteResult.ok) {
			if (deleteResult.error.code === "PERMISSION_DENIED") {
				const reasonCode = (deleteResult.error.details as any)?.reasonCode;
				assert(typeof reasonCode === "string" && reasonCode.length > 0, "viewer delete reasonCode should be non-empty when denied");
			} else {
				assert(deleteResult.error.code === "NOT_FOUND", "viewer delete may also return NOT_FOUND for nonexistent comment");
			}
		}
	}

	// Non-member is denied create/delete
	{
		const outsiderUser: CurrentUser = {
			id: "user-outsider",
			displayName: "Outsider User",
			roles: ["EDITOR"],
		};
		setCurrentUserProvider(new TestCurrentUserProvider(outsiderUser));

		const createResult = await commentsService.createComment(projectId, {
			anchorType: "map",
			anchorId: "map-4",
			body: "Outsider comment",
		});
		assert(!createResult.ok, "non-member create should be denied");
		if (!createResult.ok) {
			assert(createResult.error.code === "PERMISSION_DENIED", "non-member create should use PERMISSION_DENIED");
			const reasonCode = (createResult.error.details as any)?.reasonCode;
			assert(typeof reasonCode === "string" && reasonCode.length > 0, "non-member create reasonCode should be non-empty");
		}
	}

	// Wrong-project delete yields RESOURCE_NOT_IN_PROJECT
	{
		const projectA = "proj-comments-A";
		const projectB = "proj-comments-B";

		const { membershipService: membershipA, commentsService: commentsA } = await setup(projectA);
		const { membershipService: membershipB, commentsService: commentsB } = await setup(projectB);

		await membershipA.addOrUpdateMembership(projectA, "user-cross", "OWNER");
		await membershipB.addOrUpdateMembership(projectB, "user-cross", "OWNER");

		const user: CurrentUser = {
			id: "user-cross",
			displayName: "Cross Project User",
			roles: ["OWNER"],
		};
		setCurrentUserProvider(new TestCurrentUserProvider(user));

		const createResult = await commentsA.createComment(projectA, {
			anchorType: "map",
			anchorId: "map-cross",
			body: "Cross project comment",
		});
		assert(createResult.ok, "create in projectA should succeed");
		const commentId = createResult.value.commentId;

		const deleteResult = await commentsB.deleteComment(projectB, commentId);
		assert(!deleteResult.ok, "wrong-project delete should be denied");
		if (!deleteResult.ok) {
			assert(deleteResult.error.code === "PERMISSION_DENIED", "wrong-project delete must use PERMISSION_DENIED");
			const reasonCode = (deleteResult.error.details as any)?.reasonCode;
			assert(reasonCode === "RESOURCE_NOT_IN_PROJECT", "wrong-project delete should yield RESOURCE_NOT_IN_PROJECT");
		}
	}
}

runCommentsPermissionsTests().catch((err) => {
	// eslint-disable-next-line no-console
	console.error("commentsPermissions tests failed", err);
	process.exitCode = 1;
});
