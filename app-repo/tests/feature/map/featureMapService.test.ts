import { CoreRuntime } from "../../../src/core/CoreRuntime";
import { ProjectDb } from "../../../src/core/ProjectDb";
import { DefaultFeatureMapService } from "../../../src/feature/map/FeatureMapService";
import { MapMetadata, ProjectId, MapId } from "../../../src/feature/map/FeatureMapTypes";
import type { PermissionService } from "../../../src/core/permissions/PermissionService";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

class MockPermissionService implements PermissionService {
  public allowed = true;

  can(): boolean {
    return this.allowed;
  }

  canWithReason() {
    return { allowed: this.allowed, reasonCode: this.allowed ? "OK" : "DENIED" } as any;
  }
}

async function createRuntimeAndSeedProject(projectId: ProjectId) {
  const runtime = new CoreRuntime({
    storageRoot: "/storage",
    useInMemoryDal: true,
    useDalLocks: true,
    lockDiagnosticsRepositoryCapacity: 10,
  });

  const projectDb = new ProjectDb(runtime);
  const conn = await projectDb.getConnection(projectId);

  // Minimal schema for maps and map_calibrations tables consistent with conceptual spec.
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
    )` ,
    parameters: [],
  });

  await conn.executeCommand({
    text: `CREATE TABLE IF NOT EXISTS map_calibrations (
      project_id TEXT NOT NULL,
      map_id TEXT NOT NULL,
      calibration_id TEXT PRIMARY KEY,
      transform_type TEXT,
      rms_error REAL,
      is_active INTEGER NOT NULL DEFAULT 0
    )` ,
    parameters: [],
  });

  // Seed one uncalibrated map.
  await conn.executeCommand({
    text:
      "INSERT INTO maps (project_id, map_id, name, description, map_type, tags_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    parameters: [
      projectId,
      "map-uncalibrated",
      "Uncalibrated Map",
      "An uncalibrated map",
      "floorplan",
      JSON.stringify(["tag-a"]),
      "active",
      "2025-01-01T00:00:00Z",
      "2025-01-01T00:00:00Z",
    ],
  });

  // Seed one calibrated map with an active calibration.
  await conn.executeCommand({
    text:
      "INSERT INTO maps (project_id, map_id, name, description, map_type, tags_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    parameters: [
      projectId,
      "map-calibrated",
      "Calibrated Map",
      "A calibrated map",
      "floorplan",
      JSON.stringify(["tag-b"]),
      "active",
      "2025-01-02T00:00:00Z",
      "2025-01-02T00:00:00Z",
    ],
  });

  await conn.executeCommand({
    text:
      "INSERT INTO map_calibrations (project_id, map_id, calibration_id, transform_type, rms_error, is_active) VALUES (?, ?, ?, ?, ?, 1)",
    parameters: [
      projectId,
      "map-calibrated",
      "cal-1",
      "similarity",
      0.5,
    ],
  });

  return { runtime, projectDb };
}

async function runFeatureMapServiceReadTests(): Promise<void> {
  const projectId: ProjectId = "proj-feature-map";
  const { projectDb } = await createRuntimeAndSeedProject(projectId);
  const permissionService = new MockPermissionService();
  const service = new DefaultFeatureMapService({ projectDb, permissionService });

  // When permissions allow, both maps should be visible with correct calibration summary.
  const maps = await service.listMaps(projectId);
  assert(maps.length === 2, "expected two maps from listMaps");

  const uncalibrated = maps.find((m) => m.id === "map-uncalibrated");
  const calibrated = maps.find((m) => m.id === "map-calibrated");

  assert(!!uncalibrated, "uncalibrated map should be present");
  assert(!!calibrated, "calibrated map should be present");

  assert(uncalibrated!.isCalibrated === false, "uncalibrated map should report isCalibrated=false");
  assert(
    uncalibrated!.calibrationTransformType === undefined,
    "uncalibrated map should not have calibrationTransformType",
  );
  assert(
    uncalibrated!.calibrationErrorRms === undefined || uncalibrated!.calibrationErrorRms === null,
    "uncalibrated map should not have calibrationErrorRms",
  );

  assert(calibrated!.isCalibrated === true, "calibrated map should report isCalibrated=true");
  assert(
    calibrated!.calibrationTransformType === "similarity",
    "calibrated map should expose calibrationTransformType from active calibration",
  );
  assert(
    calibrated!.calibrationErrorRms === 0.5,
    "calibrated map should expose calibrationErrorRms from active calibration",
  );

  // getMap should return the same metadata for each map.
  const uncalibratedSingle = await service.getMap(projectId, "map-uncalibrated" as MapId);
  const calibratedSingle = await service.getMap(projectId, "map-calibrated" as MapId);

  assert(uncalibratedSingle !== null, "getMap should return uncalibrated map");
  assert(calibratedSingle !== null, "getMap should return calibrated map");

  assert(uncalibratedSingle!.isCalibrated === false, "single uncalibrated map should report isCalibrated=false");
  assert(calibratedSingle!.isCalibrated === true, "single calibrated map should report isCalibrated=true");

  // When permissions deny, read operations should throw in line with core patterns.
  permissionService.allowed = false;
  let threw = false;
  try {
    await service.listMaps(projectId);
  } catch (err) {
    threw = true;
  }
  assert(threw, "listMaps should throw when permission is denied");

  threw = false;
  try {
    await service.getMap(projectId, "map-uncalibrated" as MapId);
  } catch (err) {
    threw = true;
  }
  assert(threw, "getMap should throw when permission is denied");
}

(async () => {
  await runFeatureMapServiceReadTests();
})();
