import * as fs from "fs";
import * as path from "path";

export interface ProjectExportManifest {
	projectId: string;
	projectName?: string;
	exportTimestamp: string;
	version: string;
}

export interface ProjectExportDescriptor {
	projectId: string;
	manifest: ProjectExportManifest;
	projectDbPath: string;
	filesPath?: string;
}

export interface ProjectImportBundle {
	projectDbPath: string;
	filesPath?: string;
	manifest: ProjectExportManifest;
}

export interface ProjectExportService {
	exportProject(projectId: string): Promise<ProjectExportDescriptor>;
}

export interface ProjectImportService {
	importProject(bundle: ProjectImportBundle): Promise<{ projectId: string }>;
}

export function createProjectExportService(projectDbRoot: string): ProjectExportService {
	return {
		async exportProject(projectId: string): Promise<ProjectExportDescriptor> {
			const projectDbPath = path.join(projectDbRoot, "projects", projectId, "project.db");

			if (!fs.existsSync(projectDbPath)) {
				throw new Error(`Project DB not found at ${projectDbPath}`);
			}

			const manifest: ProjectExportManifest = {
				projectId,
				projectName: undefined,
				exportTimestamp: new Date().toISOString(),
				version: "1",
			};

			return {
				projectId,
				manifest,
				projectDbPath,
				filesPath: undefined,
			};
		},
	};
}

export function createProjectImportService(projectDbRoot: string): ProjectImportService {
	return {
		async importProject(bundle: ProjectImportBundle): Promise<{ projectId: string }> {
			const sourcePath = bundle.projectDbPath;
			if (!fs.existsSync(sourcePath)) {
				throw new Error(`Source project DB not found at ${sourcePath}`);
			}

			const targetProjectId = bundle.manifest.projectId;
			const targetDir = path.join(projectDbRoot, "projects", targetProjectId);
			const targetPath = path.join(targetDir, "project.db");

			if (!fs.existsSync(targetDir)) {
				fs.mkdirSync(targetDir, { recursive: true });
			}

			fs.copyFileSync(sourcePath, targetPath);

			return { projectId: targetProjectId };
		},
	};
}
