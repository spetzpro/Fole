import { CoreRuntime } from "../../../src/core/CoreRuntime";
import { ProjectDb } from "../../../src/core/ProjectDb";
import { DefaultFeatureMapService, WriteContext } from "../../../src/feature/map/FeatureMapService";
import type { PermissionService } from "../../../src/core/permissions/PermissionService";
import type { PermissionContext } from "../../../src/core/permissions/PermissionModel";
import { MapType, ProjectId } from "../../../src/feature/map/FeatureMapTypes";
import { createProjectMembershipService } from "../../../src/core/ProjectMembershipService";
import { initDefaultPolicies } from "../../../src/core/permissions/PolicyRegistry";
import { getPermissionService } from "../../../src/core/permissions/PermissionService";
import { getCurrentUserProvider } from "../../../src/core/auth/CurrentUserProvider";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

class MockPermissionService implements PermissionService {
  public allowed = true;

  can(_ctx: PermissionContext): boolean {
    return this.allowed;
  }

  canWithReason(_ctx: PermissionContext) {
    return { allowed: this.allowed, reasonCode: this.allowed ? "OK" : "DENIED" } as any;
  }
}

async function createRuntimeAndService(projectId: ProjectId) {
  const runtime = new CoreRuntime({
    storageRoot: "/storage",
    useInMemoryDal: true,
    useDalLocks: true,
    lockDiagnosticsRepositoryCapacity: 10,
  });

  const projectDb = new ProjectDb(runtime);
  const projectMembershipService = createProjectMembershipService(projectDb);

  initDefaultPolicies();
  const permissionService = getPermissionService();

  const service = new DefaultFeatureMapService({
    projectDb,
    permissionService,
    projectMembershipService,
  });
  return { service, projectDb, projectMembershipService };
}

async function runFeatureMapServiceWriteContracts(): Promise<void> {
  const projectId: ProjectId = "proj-feature-map-writes";
  const { service, projectDb, projectMembershipService } = await createRuntimeAndService(projectId);

  const currentUserProvider = getCurrentUserProvider();

  const ctx: WriteContext = { userId: "tester" };

  const conn = await projectDb.getConnection(projectId);

  await conn.executeCommand({
    text: `CREATE TABLE IF NOT EXISTS maps (
      project_id TEXT NOT NULL,
      map_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      map_type TEXT NOT NULL,
      tags_json TEXT,
      status TEXT NOT NULL,
      created_at TEXT,
      updated_at TEXT
    )`,
    parameters: [],
  });

  // a) Owner membership can create map (MAP_EDIT granted)
  currentUserProvider.setCurrentUser({
    id: "user-owner",
    displayName: "Owner User",
    roles: ["OWNER"],
  } as any);

  await projectMembershipService.addOrUpdateMembership(projectId, "user-owner", "OWNER");

  const created = await service.createMap(
    {
      projectId,
      name: "Owner Map",
      mapType: "floorplan" as MapType,
    },
    ctx
  );

  assert(created.projectId === projectId, "created map should belong to project");
  assert(created.name === "Owner Map", "created map should have given name");
  assert(created.mapType === "floorplan", "created map should have given type");

  const rows = await conn.executeQuery<any>({
    text: "SELECT * FROM maps WHERE project_id = ?",
    parameters: [projectId],
  });
  assert(rows.rows.length === 1, "one map row should exist after owner create");

  // b) Viewer membership cannot create map
  currentUserProvider.setCurrentUser({
    id: "user-viewer",
    displayName: "Viewer User",
    roles: ["VIEWER"],
  } as any);

  await projectMembershipService.addOrUpdateMembership(projectId, "user-viewer", "VIEWER");

  let threw = false;
  try {
    await service.createMap(
      {
        projectId,
        name: "Viewer Map",
        mapType: "floorplan" as MapType,
      },
      ctx
    );
  } catch (err: any) {
    threw = true;
    assert((err as any).code === "FORBIDDEN", "viewer createMap should be forbidden");
    assert(
      typeof err.message === "string" && err.message.includes("map.edit"),
      "error message should mention map.edit"
    );
  }
  assert(threw, "viewer createMap should throw");

  // c) Non-member cannot create map
  currentUserProvider.setCurrentUser({
    id: "user-nonmember",
    displayName: "NonMember User",
    roles: ["EDITOR"],
  } as any);

  threw = false;
  try {
    await service.createMap(
      {
        projectId,
        name: "NonMember Map",
        mapType: "floorplan" as MapType,
      },
      ctx
    );
  } catch (err: any) {
    threw = true;
    assert((err as any).code === "FORBIDDEN", "non-member createMap should be forbidden");
  }
  assert(threw, "non-member createMap should throw");
}

(async () => {
  await runFeatureMapServiceWriteContracts();
})();
