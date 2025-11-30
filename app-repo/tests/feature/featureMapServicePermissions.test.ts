import { DefaultFeatureMapService } from "@/feature/map/FeatureMapService";
import type { FeatureMapServiceDeps } from "@/feature/map/FeatureMapService";
import { getPermissionService } from "@/core/permissions/PermissionService";
import { initDefaultPolicies } from "@/core/permissions/PolicyRegistry";
import type { PermissionContext } from "@/core/permissions/PermissionModel";
import { deriveGlobalPermissionsForUser } from "@/core/permissions/PermissionModel";
import type { CurrentUser } from "@/core/auth/CurrentUserTypes";
import type { ProjectDb } from "@/core/ProjectDb";

// Simple in-memory ProjectDb test double based on patterns from existing tests.
class InMemoryProjectDb implements ProjectDb {
  private mapsByProject = new Map<string, any[]>();

  constructor() {}

  async getConnection(projectId: string): Promise<{ executeQuery<T>(q: { text: string; parameters: any[] }): Promise<T[]> }> {
    return {
      executeQuery: async <T>() => {
        return (this.mapsByProject.get(projectId) ?? []) as T[];
      },
    };
  }

  seedMaps(projectId: string, rows: any[]): void {
    this.mapsByProject.set(projectId, rows);
  }
}

function makeContextWithRoles(roles: string[]): PermissionContext {
  const user: CurrentUser = {
    id: "test-user",
    displayName: "Test User",
    roles,
  };

  return {
    user,
    globalPermissions: deriveGlobalPermissionsForUser(user),
  };
}

describe("FeatureMapService permissions integration", () => {
  beforeAll(() => {
    initDefaultPolicies();
  });

  it("VIEWER can list maps for a project", async () => {
    const projectId = "project-1";
    const db = new InMemoryProjectDb();
    db.seedMaps(projectId, [
      {
        mapId: "map-1",
        projectId,
        name: "Test Map",
        description: "Test description",
        mapType: "raster",
        tagsJson: JSON.stringify(["tag1"]),
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        calibrationTransformType: null,
        calibrationErrorRms: null,
      },
    ]);

    const deps: FeatureMapServiceDeps = {
      projectDb: db as unknown as ProjectDb,
      permissionService: getPermissionService(),
      getPermissionContext: () => makeContextWithRoles(["VIEWER"]),
    };

    const service = new DefaultFeatureMapService(deps);
    const maps = await service.listMaps(projectId);

    expect(maps.length).toBe(1);
    expect(maps[0].mapId).toBe("map-1");
  });

  it("unauthenticated context cannot list maps", async () => {
    const projectId = "project-2";
    const db = new InMemoryProjectDb();
    db.seedMaps(projectId, [
      {
        mapId: "map-2",
        projectId,
        name: "Another Map",
        description: "Another description",
        mapType: "raster",
        tagsJson: JSON.stringify(["tag2"]),
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        calibrationTransformType: null,
        calibrationErrorRms: null,
      },
    ]);

    const deps: FeatureMapServiceDeps = {
      projectDb: db as unknown as ProjectDb,
      permissionService: getPermissionService(),
      getPermissionContext: () => ({
        user: null,
        globalPermissions: [],
      }),
    };

    const service = new DefaultFeatureMapService(deps);

    await expect(service.listMaps(projectId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
