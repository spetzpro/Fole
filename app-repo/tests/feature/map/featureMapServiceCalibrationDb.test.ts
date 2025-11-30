import { getPermissionService } from "@/core/permissions/PermissionService";
import { initDefaultPolicies } from "@/core/permissions/PolicyRegistry";
import type { PermissionContext } from "@/core/permissions/PermissionModel";
import { deriveGlobalPermissionsForUser } from "@/core/permissions/PermissionModel";
import type { CurrentUser } from "@/core/auth/CurrentUserTypes";
import { DefaultFeatureMapService } from "@/feature/map/FeatureMapService";
import type { ProjectDb } from "@/core/ProjectDb";
import { createTestProjectDb } from "@/tests/helpers/projectDbTestUtils";
import { PROJECT_DB_INITIAL_MIGRATIONS } from "@/core/db/migrations/CoreInitialMigrations";

async function runProjectMigrations(db: any) {
  for (const migration of PROJECT_DB_INITIAL_MIGRATIONS) {
    for (const step of migration.up) {
      if (step.kind === "create_table") {
        const columns = (step as any).columns?.map((c: any) => `${c.name} ${c.type}${c.notNull ? " NOT NULL" : ""}${c.defaultValue !== undefined ? ` DEFAULT ${c.defaultValue}` : ""}`) ?? [];
        const pk = (step as any).primaryKey?.length ? `, PRIMARY KEY(${(step as any).primaryKey.join(", ")})` : "";
        const sql = `CREATE TABLE IF NOT EXISTS ${step.tableName} (${columns.join(", ")}${pk});`;
        await db.exec(sql);
      } else if (step.kind === "create_index") {
        const sql = `CREATE INDEX IF NOT EXISTS ${step.indexName} ON ${step.tableName}(${(step as any).columns.join(", ")});`;
        await db.exec(sql);
      }
    }
  }
}

function makeViewerContext(): PermissionContext {
  const user: CurrentUser = {
    id: "viewer-1",
    displayName: "Viewer",
    roles: ["VIEWER"],
  };
  return {
    user,
    globalPermissions: deriveGlobalPermissionsForUser(user),
  };
}

describe("FeatureMapService with real DB calibrations", () => {
  beforeAll(() => {
    initDefaultPolicies();
  });

  it("reads calibration summary from map_calibrations", async () => {
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

    await db.exec(
      "INSERT INTO map_calibrations (project_id, map_id, calibration_id, is_active, transform_type, rms_error, created_at) VALUES (?,?,?,?,?,?,?)",
      [
        projectId,
        mapId,
        "cal-1",
        1,
        "similarity",
        0.123,
        new Date().toISOString(),
      ]
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
    };

    const service = new DefaultFeatureMapService({
      projectDb,
      permissionService: getPermissionService(),
      getPermissionContext: () => makeViewerContext(),
    });

    const maps = await service.listMaps(projectId);
    expect(maps.length).toBe(1);
    const map = maps[0];

    expect(map.isCalibrated).toBe(true);
    expect(map.calibrationTransformType).toBe("similarity");
    expect(map.calibrationErrorRms).toBe(0.123);
  });
});
