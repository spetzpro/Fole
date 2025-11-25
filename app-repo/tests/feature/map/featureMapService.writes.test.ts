import { CoreRuntime } from "../../../src/core/CoreRuntime";
import { ProjectDb } from "../../../src/core/ProjectDb";
import { DefaultFeatureMapService, WriteContext } from "../../../src/feature/map/FeatureMapService";
import type { PermissionService } from "../../../src/core/permissions/PermissionService";
import type { PermissionContext } from "../../../src/core/permissions/PermissionModel";
import { MapId, MapStatus, MapType, ProjectId } from "../../../src/feature/map/FeatureMapTypes";

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
  const permissionService = new MockPermissionService();

  const getPermissionContext = (): PermissionContext => ({
    // Minimal placeholder; real implementation will align with core permissions.
    userId: "tester",
    projectId,
  } as any);

  const service = new DefaultFeatureMapService({ projectDb, permissionService, getPermissionContext });
  return { service, projectDb, permissionService };
}

async function runFeatureMapServiceWriteContracts(): Promise<void> {
  const projectId: ProjectId = "proj-feature-map-writes";
  const { service, permissionService, projectDb } = await createRuntimeAndService(projectId);

  const ctx: WriteContext = { userId: "tester" };

  // For now, document that writes are NotImplemented, without enforcing behavior yet.
  let threw = false;
  try {
    await service.createMap({
      projectId,
      name: "New Map",
      mapType: "floorplan" as MapType,
    }, ctx);
  } catch (err: any) {
    threw = true;
    assert(err.message.includes("NotImplemented"), "createMap should currently be NotImplemented");
  }
  assert(threw, "createMap should throw NotImplemented until implemented");

  threw = false;
  try {
    await service.updateMapMetadata({
      projectId,
      mapId: "map-1" as MapId,
      name: "Updated Name",
    }, ctx);
  } catch (err: any) {
    threw = true;
    assert(err.message.includes("NotImplemented"), "updateMapMetadata should currently be NotImplemented");
  }
  assert(threw, "updateMapMetadata should throw NotImplemented until implemented");

  threw = false;
  try {
    await service.updateMapStatus({
      projectId,
      mapId: "map-1" as MapId,
      status: "archived" as MapStatus,
    }, ctx);
  } catch (err: any) {
    threw = true;
    assert(err.message.includes("NotImplemented"), "updateMapStatus should currently be NotImplemented");
  }
  assert(threw, "updateMapStatus should throw NotImplemented until implemented");

  // Future: once implementations exist, these tests should be updated to assert
  // actual DB mutations and permission enforcement for map.manage.
}

(async () => {
  await runFeatureMapServiceWriteContracts();
})();
