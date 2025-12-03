import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Result, AppError } from "../../../src/core/foundation/CoreTypes";
import { setCurrentUserProvider, type CurrentUserProvider } from "../../../src/core/auth/CurrentUserProvider";
import type { ProjectRegistry } from "../../../src/core/storage/modules/ProjectRegistry";
import type { Project } from "../../../src/core/model/ProjectModel";
import type { ProjectMembershipService } from "../../../src/core/ProjectMembershipService";
import type { PermissionDecision, PermissionContext, ResourceDescriptor } from "../../../src/core/permissions/PermissionModel";
import { getPermissionService } from "../../../src/core/permissions/PermissionService";
import type { FeatureMapService } from "../../../src/feature/map/FeatureMapService";
import { createProjectOverviewService, type ProjectOverviewServiceDeps } from "../../../src/feature/debug/ProjectOverviewService";

vi.mock("../../../src/core/permissions/PermissionService", () => {
  const canWithReason = vi.fn();
  return {
    getPermissionService: () => ({
      can: vi.fn((ctx: PermissionContext, action: any, resource: ResourceDescriptor) => canWithReason(ctx, action, resource).allowed),
      canWithReason,
    }),
  };
});

function makeOk<T>(value: T): Result<T, AppError> {
  return { ok: true, value };
}

function makeErr<T = never>(error: AppError): Result<T, AppError> {
  return { ok: false, error };
}

describe("ProjectOverviewService", () => {
  let originalProvider: CurrentUserProvider | undefined;

  beforeEach(() => {
    // Reset current user provider and permission mocks between tests.
    // Capture existing provider once (if any) to restore after all tests if needed.
    originalProvider = undefined;
  });

  function setCurrentUser(id: string | null) {
    const provider: CurrentUserProvider = {
      getCurrentUser: () => (id ? { id, displayName: "Test User", email: undefined, roles: [] } : null),
      isAuthenticated: () => !!id,
    };
    setCurrentUserProvider(provider);
  }

  function createDeps(overrides: Partial<ProjectOverviewServiceDeps> = {}): ProjectOverviewServiceDeps {
    const projectRegistry: ProjectRegistry = {
      listProjects: vi.fn(),
      getProjectById: vi.fn(),
      createProject: vi.fn(),
      openProject: vi.fn(),
    };

    const membershipService: ProjectMembershipService = {
      getMembership: vi.fn(),
      addOrUpdateMembership: vi.fn(),
      removeMembership: vi.fn(),
    };

    const featureMapService: FeatureMapService = {
      listMaps: vi.fn(),
      getMap: vi.fn(),
      createMap: vi.fn(),
      updateMapMetadata: vi.fn(),
      updateMapStatus: vi.fn(),
    } as any;

    return {
      projectRegistry,
      membershipService,
      featureMapService,
      ...overrides,
    };
  }

  it("listProjectsForCurrentUser returns PERMISSION_DENIED when not authenticated", async () => {
    setCurrentUser(null);

    const deps = createDeps();
    const service = createProjectOverviewService(deps);

    const result = await service.listProjectsForCurrentUser();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PERMISSION_DENIED");
      expect(result.error.details?.reasonCode).toBe("NOT_AUTHENTICATED");
    }
  });

  it("listProjectsForCurrentUser filters projects by PROJECT_READ", async () => {
    setCurrentUser("user-1");

    const deps = createDeps();
    const projectRegistry = deps.projectRegistry as ProjectRegistry;

    const projects: Project[] = [
      { id: "p1", name: "Project 1", createdAt: "2025-01-01T00:00:00Z" } as any,
      { id: "p2", name: "Project 2", createdAt: "2025-01-02T00:00:00Z" } as any,
    ];
    (projectRegistry.listProjects as any).mockResolvedValue(makeOk(projects));

    const permissionService = getPermissionService();
    const canWithReason = (permissionService as any).canWithReason as jest.MockedFunction<any>;

    canWithReason.mockImplementation((ctx: PermissionContext, action: any, resource: ResourceDescriptor): PermissionDecision => {
      if (resource.id === "p1") {
        return { allowed: true, reasonCode: "ALLOWED", grantSource: "membership" };
      }
      return { allowed: false, reasonCode: "DENIED", grantSource: "membership" };
    });

    const service = createProjectOverviewService(deps);
    const result = await service.listProjectsForCurrentUser();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0].id).toBe("p1");
    }
  });

  it("getProjectOverviewForCurrentUser returns NOT_FOUND when project is missing", async () => {
    setCurrentUser("user-1");

    const deps = createDeps();
    const projectRegistry = deps.projectRegistry as ProjectRegistry;
    (projectRegistry.getProjectById as any).mockResolvedValue(makeOk<Project | null>(null));

    const service = createProjectOverviewService(deps);
    const result = await service.getProjectOverviewForCurrentUser("missing-project");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
      expect(result.error.details?.projectId).toBe("missing-project");
    }
  });

  it("getProjectOverviewForCurrentUser returns PERMISSION_DENIED when PROJECT_READ denied", async () => {
    setCurrentUser("user-1");

    const deps = createDeps();
    const projectRegistry = deps.projectRegistry as ProjectRegistry;
    const project: Project = { id: "p1", name: "Project 1", createdAt: "2025-01-01T00:00:00Z" } as any;
    (projectRegistry.getProjectById as any).mockResolvedValue(makeOk<Project | null>(project));

    const permissionService = getPermissionService();
    const canWithReason = (permissionService as any).canWithReason as jest.MockedFunction<any>;

    canWithReason.mockImplementation((): PermissionDecision => ({
      allowed: false,
      reasonCode: "DENIED",
      grantSource: "membership",
    }));

    const service = createProjectOverviewService(deps);
    const result = await service.getProjectOverviewForCurrentUser("p1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PERMISSION_DENIED");
      expect(result.error.details?.reasonCode).toBe("DENIED");
      expect(result.error.details?.grantSource).toBe("membership");
    }
  });

  it("getProjectOverviewForCurrentUser returns overview with maps summary", async () => {
    setCurrentUser("user-1");

    const deps = createDeps();
    const projectRegistry = deps.projectRegistry as ProjectRegistry;
    const featureMapService = deps.featureMapService as FeatureMapService;

    const project: Project = { id: "p1", name: "Project 1", createdAt: "2025-01-01T00:00:00Z" } as any;
    (projectRegistry.getProjectById as any).mockResolvedValue(makeOk<Project | null>(project));

    const permissionService = getPermissionService();
    const canWithReason = (permissionService as any).canWithReason as jest.MockedFunction<any>;
    canWithReason.mockImplementation((): PermissionDecision => ({
      allowed: true,
      reasonCode: "ALLOWED",
      grantSource: "membership",
    }));

    (featureMapService.listMaps as any).mockResolvedValue([
      { mapId: "m1", name: "Map 1", calibrationSummary: {} },
      { mapId: "m2", name: "Map 2", calibrationSummary: null },
    ]);

    const service = createProjectOverviewService(deps);
    const result = await service.getProjectOverviewForCurrentUser("p1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.project.id).toBe("p1");
      expect(result.value.mapsSummary.total).toBe(2);
      expect(result.value.mapsSummary.items).toHaveLength(2);
      expect(result.value.mapsSummary.items[0]).toEqual({ id: "m1", name: "Map 1", hasCalibration: true });
      expect(result.value.mapsSummary.items[1]).toEqual({ id: "m2", name: "Map 2", hasCalibration: false });
      expect(result.value.filesSummary.total).toBe(0);
      expect(result.value.commentsSummary.total).toBe(0);
    }
  });
});
