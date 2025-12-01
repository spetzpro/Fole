import * as fs from "fs";
import * as path from "path";
import { CoreRuntime } from "../../src/core/CoreRuntime";
import { ProjectDb } from "../../src/core/ProjectDb";
import { createProjectMembershipService } from "../../src/core/ProjectMembershipService";
import {
	createProjectExportService,
	createProjectImportService,
	createSecuredProjectExportService,
	createSecuredProjectImportService,
	ProjectExportManifest,
} from "../../src/core/ProjectExportImportService";
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
	const base = path.join(process.cwd(), "tmp-project-export-import-secured-tests");
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
		text: `CREATE TABLE IF NOT EXISTS project_members (
		  project_id TEXT NOT NULL,
		  user_id TEXT NOT NULL,
		  role_id TEXT NOT NULL
		)`,
		parameters: [],
	});

	// create a dummy project.db file in the expected filesystem location
	const projectDir = path.join(projectsRoot, projectId);
	const projectDbPath = path.join(projectDir, "project.db");
	if (!fs.existsSync(projectDir)) {
		fs.mkdirSync(projectDir, { recursive: true });
	}
	fs.writeFileSync(projectDbPath, "dummy db content");

	initDefaultPolicies();
	const permissionService = getPermissionService();

	const baseExport = createProjectExportService(root);
	const baseImport = createProjectImportService(root);

	const securedExport = createSecuredProjectExportService(
		baseExport,
		membershipService,
		permissionService
	);
	const securedImport = createSecuredProjectImportService(baseImport, permissionService);

	return { root, projectsRoot, membershipService, securedExport, securedImport };
}

async function runProjectExportImportSecuredTests(): Promise<void> {
	const projectId = "proj-secured-export";
	const { root, projectsRoot, membershipService, securedExport, securedImport } = await setup(projectId);

	// a) Owner (with PROJECT_READ via membership) can export project
	{
		await membershipService.addOrUpdateMembership(projectId, "user-owner", "OWNER");

		const ownerUser: CurrentUser = {
			id: "user-owner",
			displayName: "Owner User",
			roles: ["OWNER"],
		};
		setCurrentUserProvider(new TestCurrentUserProvider(ownerUser));

		const desc = await securedExport.exportProject(projectId);
		assert(desc.projectId === projectId, "secured export should return matching projectId");
		const expectedPath = path.join(projectsRoot, projectId, "project.db");
		assert(desc.projectDbPath === expectedPath, "secured export projectDbPath should match expected path");
	}

	// b) Non-member cannot export project
	{
		const outsider: CurrentUser = {
			id: "user-nonmember",
			displayName: "NonMember",
			roles: ["EDITOR"],
		};
		setCurrentUserProvider(new TestCurrentUserProvider(outsider));

		let threw = false;
		try {
			await securedExport.exportProject(projectId);
		} catch (err: any) {
			threw = true;
			assert((err as any).code === "FORBIDDEN", "expected FORBIDDEN for non-member export");
		}
		assert(threw, "expected non-member export to throw");
	}

	// c) Admin can import project
	{
		const importUser: CurrentUser = {
			id: "user-admin",
			displayName: "Admin User",
			roles: ["ADMIN"],
		};
		setCurrentUserProvider(new TestCurrentUserProvider(importUser));

		const sourceDir = path.join(root, "source-import");
		const sourceDbPath = path.join(sourceDir, "project.db");
		if (!fs.existsSync(sourceDir)) {
			fs.mkdirSync(sourceDir, { recursive: true });
		}
		fs.writeFileSync(sourceDbPath, "import db content");

		const manifest: ProjectExportManifest = {
			projectId: "proj-secured-import",
			projectName: "Secured Import Project",
			exportTimestamp: new Date().toISOString(),
			version: "1",
		};

		const bundle = {
			projectDbPath: sourceDbPath,
			filesPath: undefined,
			manifest,
		};

		const result = await securedImport.importProject(bundle);
		assert(result.projectId === manifest.projectId, "secured import should return manifest projectId");

		const targetDbPath = path.join(projectsRoot, manifest.projectId, "project.db");
		assert(fs.existsSync(targetDbPath), "imported project.db should exist at target location");
		const contents = fs.readFileSync(targetDbPath, "utf8");
		assert(contents === "import db content", "imported project.db should match source content");
	}

	// d) Non-admin cannot import project
	{
		const nonAdmin: CurrentUser = {
			id: "user-regular",
			displayName: "Regular User",
			roles: ["EDITOR"],
		};
		setCurrentUserProvider(new TestCurrentUserProvider(nonAdmin));

		const sourceDir = path.join(root, "source-import-2");
		const sourceDbPath = path.join(sourceDir, "project.db");
		if (!fs.existsSync(sourceDir)) {
			fs.mkdirSync(sourceDir, { recursive: true });
		}
		fs.writeFileSync(sourceDbPath, "import db content 2");

		const manifest: ProjectExportManifest = {
			projectId: "proj-secured-import-2",
			projectName: "Secured Import Project 2",
			exportTimestamp: new Date().toISOString(),
			version: "1",
		};

		const bundle = {
			projectDbPath: sourceDbPath,
			filesPath: undefined,
			manifest,
		};

		let threw = false;
		try {
			await securedImport.importProject(bundle);
		} catch (err: any) {
			threw = true;
			assert((err as any).code === "FORBIDDEN", "expected FORBIDDEN for non-admin import");
		}
		assert(threw, "expected non-admin import to throw");
	}
}

runProjectExportImportSecuredTests().catch((err) => {
	// eslint-disable-next-line no-console
	console.error("projectExportImportSecured tests failed", err);
	process.exitCode = 1;
});
