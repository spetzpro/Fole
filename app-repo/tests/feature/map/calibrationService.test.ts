import { createTestProjectDb } from "@/tests/helpers/projectDbTestUtils";
import { PROJECT_DB_INITIAL_MIGRATIONS } from "@/core/db/migrations/CoreInitialMigrations";
import type { ProjectDb } from "@/core/ProjectDb";
import { createCalibrationService } from "@/feature/map/CalibrationService";
import type { CalibrationTransformType } from "@/feature/map/FeatureMapTypes";

async function runProjectMigrations(db: any) {
  for (const migration of PROJECT_DB_INITIAL_MIGRATIONS) {
    for (const step of migration.up) {
      if (step.kind === "create_table") {
        await db.exec(`CREATE TABLE IF NOT EXISTS ${step.tableName} (dummy INTEGER)`);
      }
    }
  }
}

describe("CalibrationService (read-only)", () => {
  it("lists calibrations and returns active calibration", async () => {
    const db = await createTestProjectDb();
    await runProjectMigrations(db);

    const projectId = "project-1";
    const mapId = "map-1";

    await db.exec(
      "INSERT INTO maps (map_id, project_id, name, description, map_type, tags_json, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
      [
        mapId,
        projectId,
        "Test Map",
        "Test description",
        "raster",
        JSON.stringify(["tag1"]),
        "active",
        new Date().toISOString(),
        new Date().toISOString(),
      ]
    );

    const now = new Date();
    const t1 = new Date(now.getTime() - 30000).toISOString();
    const t2 = new Date(now.getTime() - 20000).toISOString();
    const t3 = new Date(now.getTime() - 10000).toISOString();

    await db.exec(
      "INSERT INTO map_calibrations (project_id, map_id, calibration_id, is_active, transform_type, rms_error, created_at) VALUES (?,?,?,?,?,?,?)",
      [projectId, mapId, "cal-1", 0, "similarity", 0.5, t1]
    );
    await db.exec(
      "INSERT INTO map_calibrations (project_id, map_id, calibration_id, is_active, transform_type, rms_error, created_at) VALUES (?,?,?,?,?,?,?)",
      [projectId, mapId, "cal-2", 1, "affine", 0.25, t2]
    );
    await db.exec(
      "INSERT INTO map_calibrations (project_id, map_id, calibration_id, is_active, transform_type, rms_error, created_at) VALUES (?,?,?,?,?,?,?)",
      [projectId, mapId, "cal-3", 0, "other", 0.75, t3]
    );

    const projectDb: ProjectDb = {
      async getConnection(pid: string) {
        if (pid !== projectId) throw new Error("Unexpected projectId");
        return {
          executeQuery: async <T>(_q: { text: string; parameters: any[] }) => {
            const rows = await db.all<any>(_q.text, _q.parameters);
            return rows as T[];
          },
        };
      },
    } as ProjectDb;

    const service = createCalibrationService(projectDb);

    const all = await service.listCalibrations(projectId, mapId);
    expect(all.map((c) => c.calibrationId)).toEqual(["cal-1", "cal-2", "cal-3"]);
    expect(all.map((c) => c.transformType as CalibrationTransformType)).toEqual([
      "similarity",
      "affine",
      "other",
    ]);

    const active = await service.getActiveCalibration(projectId, mapId);
    expect(active).not.toBeNull();
    expect(active!.calibrationId).toBe("cal-2");
    expect(active!.isActive).toBe(true);
    expect(active!.transformType).toBe("affine");
    expect(active!.rmsError).toBe(0.25);
  });

  it("returns null when no active calibration exists", async () => {
    const db = await createTestProjectDb();
    await runProjectMigrations(db);

    const projectId = "project-2";
    const mapId = "map-2";

    await db.exec(
      "INSERT INTO maps (map_id, project_id, name, description, map_type, tags_json, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
      [
        mapId,
        projectId,
        "Test Map 2",
        "Test description 2",
        "raster",
        JSON.stringify(["tag2"]),
        "active",
        new Date().toISOString(),
        new Date().toISOString(),
      ]
    );

    await db.exec(
      "INSERT INTO map_calibrations (project_id, map_id, calibration_id, is_active, transform_type, rms_error, created_at) VALUES (?,?,?,?,?,?,?)",
      [projectId, mapId, "cal-x", 0, "similarity", 1.0, new Date().toISOString()]
    );

    const projectDb: ProjectDb = {
      async getConnection(pid: string) {
        if (pid !== projectId) throw new Error("Unexpected projectId");
        return {
          executeQuery: async <T>(_q: { text: string; parameters: any[] }) => {
            const rows = await db.all<any>(_q.text, _q.parameters);
            return rows as T[];
          },
        };
      },
    } as ProjectDb;

    const service = createCalibrationService(projectDb);

    const active = await service.getActiveCalibration(projectId, mapId);
    expect(active).toBeNull();
  });
});
