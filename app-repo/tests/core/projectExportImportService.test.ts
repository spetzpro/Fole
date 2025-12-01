import * as fs from "fs";
import * as path from "path";
import { createProjectExportService, createProjectImportService, ProjectExportManifest } from "../../src/core/ProjectExportImportService";

function assert(condition: unknown, message: string): void {
	if (!condition) {
		throw new Error(message);
	}
}

function makeTempRoot(): string {
	const base = path.join(process.cwd(), "tmp-project-export-import-tests");
	if (!fs.existsSync(base)) {
		fs.mkdirSync(base, { recursive: true });
	}
	return base;
}

async function runProjectExportImportServiceTests(): Promise<void> {
	const root = makeTempRoot();
	const projectsRoot = path.join(root, "projects");
	if (!fs.existsSync(projectsRoot)) {
		fs.mkdirSync(projectsRoot, { recursive: true });
	}

	// a) exportProject returns a descriptor with manifest and projectDbPath
	{
		const projectId = "proj-export-test";
		const projectDir = path.join(projectsRoot, projectId);
		const projectDbPath = path.join(projectDir, "project.db");
		if (!fs.existsSync(projectDir)) {
			fs.mkdirSync(projectDir, { recursive: true });
		}
		fs.writeFileSync(projectDbPath, "dummy db content");

		const exportService = createProjectExportService(root);
		const desc = await exportService.exportProject(projectId);

		assert(desc.projectId === projectId, "exported projectId should match input");
		assert(desc.projectDbPath === projectDbPath, "projectDbPath should point to expected file");
		assert(desc.manifest.projectId === projectId, "manifest.projectId should match projectId");
		assert(typeof desc.manifest.version === "string" && desc.manifest.version.length > 0, "manifest.version should be set");
		const ts = Date.parse(desc.manifest.exportTimestamp);
		assert(!Number.isNaN(ts), "exportTimestamp should be a valid ISO string");
	}

	// b) importProject with a valid bundle returns a projectId and makes project.db available
	{
		const importService = createProjectImportService(root);
		const sourceDir = path.join(root, "source-project");
		const sourceDbPath = path.join(sourceDir, "project.db");
		if (!fs.existsSync(sourceDir)) {
			fs.mkdirSync(sourceDir, { recursive: true });
		}
		fs.writeFileSync(sourceDbPath, "import db content");

		const manifest: ProjectExportManifest = {
			projectId: "proj-import-test",
			projectName: "Import Test Project",
			exportTimestamp: new Date().toISOString(),
			version: "1",
		};

		const bundle = {
			projectDbPath: sourceDbPath,
			filesPath: undefined,
			manifest,
		};

		const result = await importService.importProject(bundle);
		assert(result.projectId === manifest.projectId, "imported projectId should match manifest.projectId");

		const targetDbPath = path.join(projectsRoot, manifest.projectId, "project.db");
		assert(fs.existsSync(targetDbPath), "target project.db should exist after import");
		const contents = fs.readFileSync(targetDbPath, "utf8");
		assert(contents === "import db content", "target project.db should match source content");
	}
}

runProjectExportImportServiceTests().catch((err) => {
	// eslint-disable-next-line no-console
	console.error("projectExportImportService tests failed", err);
	process.exitCode = 1;
});
