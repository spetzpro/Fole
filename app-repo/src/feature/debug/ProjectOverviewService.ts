import type { Result, AppError } from "../../core/foundation/CoreTypes";
import { getCurrentUserProvider } from "../../core/auth/CurrentUserProvider";
import type { ProjectRegistry } from "../../core/storage/modules/ProjectRegistry";
import type { ProjectId } from "../../core/storage/model/ProjectModel";
import type { ProjectMembershipService } from "../../core/ProjectMembershipService";
import { buildProjectPermissionContextForCurrentUser } from "../../core/permissions/PermissionGuards";
import { getPermissionService } from "../../core/permissions/PermissionService";
import type { ResourceDescriptor } from "../../core/permissions/PermissionModel";
import type { FeatureMapService } from "../map/FeatureMapService";

export interface ProjectListItem {
  id: string;
  name: string;
  createdAt?: string;
  lastOpenedAt?: string;
}

export interface ProjectOverviewDto {
  project: ProjectListItem;
  mapsSummary: {
    total: number;
    items: Array<{
      id: string;
      name: string;
      hasCalibration?: boolean;
    }>;
  };
  filesSummary: {
    total: number;
    items: Array<{
      id: string;
      name: string;
      contentType: string;
      sizeBytes: number;
      createdAt: string;
      createdBy?: string;
    }>;
  };
  commentsSummary: {
    total: number;
    items: Array<{
      commentId: string;
      anchorType: string;
      anchorId: string;
      createdAt: string;
      createdBy?: string;
    }>;
  };
}

export interface ProjectOverviewServiceDeps {
  projectRegistry: ProjectRegistry;
  membershipService: ProjectMembershipService;
  featureMapService: FeatureMapService;
  // File and comments listing will be added in a follow-up arc; for MVP we
  // return empty summaries.
}

export interface ProjectOverviewService {
  listProjectsForCurrentUser(): Promise<Result<ProjectListItem[], AppError>>;
  getProjectOverviewForCurrentUser(projectId: string): Promise<Result<ProjectOverviewDto, AppError>>;
  ensureDevSandboxProjectForCurrentUser(): Promise<ProjectListItem>;
}

function notAuthenticatedError(): Result<never, AppError> {
  return {
    ok: false,
    error: {
      code: "PERMISSION_DENIED",
      message: "Permission denied",
      details: {
        reasonCode: "NOT_AUTHENTICATED",
      },
    },
  };
}

export function createProjectOverviewService(deps: ProjectOverviewServiceDeps): ProjectOverviewService {
  const permissionService = getPermissionService();

  return {
    async listProjectsForCurrentUser(): Promise<Result<ProjectListItem[], AppError>> {
      const currentUser = getCurrentUserProvider().getCurrentUser();
      if (!currentUser) {
        return notAuthenticatedError();
      }

      const projectsResult = await deps.projectRegistry.listProjects();
      if (!projectsResult.ok) {
        return projectsResult as Result<ProjectListItem[], AppError>;
      }

      const visibleProjects: ProjectListItem[] = [];

      for (const project of projectsResult.value) {
        const projectId = project.id as ProjectId;
        const ctx = await buildProjectPermissionContextForCurrentUser(projectId, deps.membershipService);

        const resource: ResourceDescriptor = {
          type: "project",
          id: projectId,
          projectId,
        };

        const decision = permissionService.canWithReason(ctx, "PROJECT_READ", resource);
        if (decision.allowed) {
          visibleProjects.push({
            id: project.id,
            name: project.name,
            createdAt: project.createdAt,
            lastOpenedAt: (project as any).lastOpenedAt,
          });
        }
      }

      return {
        ok: true,
        value: visibleProjects,
      };
    },

    async getProjectOverviewForCurrentUser(projectId: string): Promise<Result<ProjectOverviewDto, AppError>> {
      const currentUser = getCurrentUserProvider().getCurrentUser();
      if (!currentUser) {
        return notAuthenticatedError() as Result<ProjectOverviewDto, AppError>;
      }

      const projectResult = await deps.projectRegistry.getProjectById(projectId as ProjectId);
      if (!projectResult.ok) {
        return projectResult as Result<ProjectOverviewDto, AppError>;
      }

      const project = projectResult.value;
      if (!project) {
        return {
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: "Project not found",
            details: { projectId },
          },
        };
      }

      const ctx = await buildProjectPermissionContextForCurrentUser(project.id as ProjectId, deps.membershipService);
      const resource: ResourceDescriptor = {
        type: "project",
        id: project.id as ProjectId,
        projectId: project.id as ProjectId,
      };

      const decision = permissionService.canWithReason(ctx, "PROJECT_READ", resource);
      if (!decision.allowed) {
        return {
          ok: false,
          error: {
            code: "PERMISSION_DENIED",
            message: "Permission denied",
            details: {
              reasonCode: decision.reasonCode,
              grantSource: decision.grantSource,
            },
          },
        };
      }

      // Maps summary via FeatureMapService (read-only).
      const maps = await deps.featureMapService.listMaps(project.id as ProjectId);
      const mapsItems = maps.map((m) => ({
        id: m.mapId,
        name: m.name,
        hasCalibration: m.isCalibrated,
      }));

      const overview: ProjectOverviewDto = {
        project: {
          id: project.id,
          name: project.name,
          createdAt: project.createdAt,
          lastOpenedAt: (project as any).lastOpenedAt,
        },
        mapsSummary: {
          total: mapsItems.length,
          items: mapsItems,
        },
        // File and comments summaries are intentionally empty for this MVP.
        filesSummary: {
          total: 0,
          items: [],
        },
        commentsSummary: {
          total: 0,
          items: [],
        },
      };

      return {
        ok: true,
        value: overview,
      };
    },

    async ensureDevSandboxProjectForCurrentUser(): Promise<ProjectListItem> {
      const currentUser = getCurrentUserProvider().getCurrentUser();
      if (!currentUser) {
        const err = notAuthenticatedError();
        throw err.error;
      }

      const existingResult = await deps.projectRegistry.listProjects();
      if (existingResult.ok) {
        const existing = existingResult.value.find((p) => p.id === "dev-sandbox");
        if (existing) {
          // Ensure current user has membership on the existing dev sandbox project.
          await deps.membershipService.addOrUpdateMembership(existing.id as ProjectId, currentUser.id, {
            role: "OWNER",
          } as any);

          return {
            id: existing.id,
            name: existing.name,
            createdAt: existing.createdAt,
            lastOpenedAt: (existing as any).lastOpenedAt,
          };
        }
      }

      const createResult = await deps.projectRegistry.createProject({
        name: "Dev Sandbox Project",
      });

      if (!createResult.ok) {
        throw createResult.error;
      }

      const project = createResult.value;

      // Ensure the current user is an owner of the new dev sandbox project.
      await deps.membershipService.addOrUpdateMembership(project.id as ProjectId, currentUser.id, {
        role: "OWNER",
      } as any);

      return {
        id: project.id,
        name: project.name,
        createdAt: project.createdAt,
        lastOpenedAt: (project as any).lastOpenedAt,
      };
    },
  };
}
