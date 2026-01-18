import * as fs from "fs";
import * as path from "path";
import type { ProjectMembershipService } from "./ProjectMembershipService";
import type { PermissionService } from "./permissions/PermissionService";
import type { ResourceDescriptor, PermissionContext } from "./permissions/PermissionModel";
import { buildProjectPermissionContextForCurrentUser, ensureCanPerform } from "./permissions/PermissionGuards";
import type { AppError } from "./foundation/CoreTypes";
import { getCurrentUserProvider } from "./auth/CurrentUserProvider";

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

export interface SecuredProjectExportService {
	exportProject(projectId: string): Promise<ProjectExportDescriptor>;
}

export interface SecuredProjectImportService {
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

export function createSecuredProjectExportService(
	base: ProjectExportService,
	membershipService: ProjectMembershipService,
	permissionService: PermissionService
): SecuredProjectExportService {
	async function ensureCanExportProject(projectId: string): Promise<void> {
		const ctx: PermissionContext = await buildProjectPermissionContextForCurrentUser(
			projectId,
			membershipService
		);

		const resource: ResourceDescriptor = { type: "project", id: projectId, projectId };

		const result = ensureCanPerform(permissionService, ctx, "PROJECT_EXPORT", resource);
		if (!result.ok) {
			throw result.error;
		}
	}

	return {
		async exportProject(projectId: string): Promise<ProjectExportDescriptor> {
			await ensureCanExportProject(projectId);
			return base.exportProject(projectId);
		},
	};
}

export function createSecuredProjectImportService(
	base: ProjectImportService,
	permissionService: PermissionService
): SecuredProjectImportService {
	return {
		async importProject(bundle: ProjectImportBundle): Promise<{ projectId: string }> {
			const currentUserProvider = getCurrentUserProvider();
			const user = currentUserProvider.getCurrentUser();

			if (!user || !Array.isArray(user.roles) || !user.roles.includes("ADMIN")) {
				const appError: AppError = {
					code: "PERMISSION_DENIED",
					message: "Permission denied",
					details: {
						reasonCode: "ADMIN_ROLE_REQUIRED",
						grantSource: "role_check",
					},
				};
				throw appError;
			}

			return base.importProject(bundle);
		},
	};
}
