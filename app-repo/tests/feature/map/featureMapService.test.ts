import { DefaultFeatureMapService, FeatureMapService, ListMapsOptions, WriteContext } from "../../../src/feature/map/FeatureMapService";
import { MapMetadata, MapStatus, MapType, MapTag, ProjectId, MapId } from "../../../src/feature/map/FeatureMapTypes";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

// Dummy dependency object matching the current stub FeatureMapServiceDeps shape.
const dummyDeps: any = {};

export function runFeatureMapServiceSurfaceTests(): void {
  const service: FeatureMapService = new DefaultFeatureMapService(dummyDeps);

  // Basic shape checks: methods exist and are functions.
  assert(typeof service.listMaps === "function", "listMaps should be a function");
  assert(typeof service.getMap === "function", "getMap should be a function");
  assert(typeof service.createMap === "function", "createMap should be a function");
  assert(typeof service.updateMapMetadata === "function", "updateMapMetadata should be a function");
  assert(typeof service.updateMapStatus === "function", "updateMapStatus should be a function");

  // Smoke test: calling read methods returns Promises (no behavior guarantees yet).
  const projectId: ProjectId = "project-1";
  const mapId: MapId = "map-1";

  const listPromise = service.listMaps(projectId);
  const getPromise = service.getMap(projectId, mapId);

  assert(typeof (listPromise as any).then === "function", "listMaps should return a Promise");
  assert(typeof (getPromise as any).then === "function", "getMap should return a Promise");
}

runFeatureMapServiceSurfaceTests();
