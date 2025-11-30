import { CalibrationTransformType, MapCalibration, MapId, ProjectId } from "./FeatureMapTypes";
import { ProjectDb } from "@/core/storage/ProjectDb";

export interface CalibrationService {
  listCalibrations(projectId: ProjectId, mapId: MapId): Promise<MapCalibration[]>;
  getActiveCalibration(projectId: ProjectId, mapId: MapId): Promise<MapCalibration | null>;
}

interface MapCalibrationRow {
  id: string;
  project_id: string;
  map_id: string;
  transform_type: string | null;
  rms_error: number | null;
  created_at: string;
  is_active: number;
}

function toCalibrationTransformType(value: string | null): CalibrationTransformType {
  if (value === "similarity" || value === "affine" || value === "other") {
    return value;
  }
  return "other";
}

function mapRowToCalibration(row: MapCalibrationRow): MapCalibration {
  return {
    calibrationId: row.id,
    projectId: row.project_id,
    mapId: row.map_id,
    transformType: toCalibrationTransformType(row.transform_type),
    transform: null,
    controlPoints: [],
    rmsError: row.rms_error,
    maxResidualError: null,
    createdAt: row.created_at,
    createdByUserId: null as unknown as string,
    isActive: row.is_active === 1,
  };
}

export class DefaultCalibrationService implements CalibrationService {
  constructor(private readonly projectDb: ProjectDb) {}

  async listCalibrations(projectId: ProjectId, mapId: MapId): Promise<MapCalibration[]> {
    const db = await this.projectDb.getConnection(projectId);
    const rows = await db.all<MapCalibrationRow>(
      "SELECT id, project_id, map_id, transform_type, rms_error, created_at, is_active FROM map_calibrations WHERE project_id = ? AND map_id = ? ORDER BY created_at ASC, id ASC",
      [projectId, mapId]
    );
    return rows.map(mapRowToCalibration);
  }

  async getActiveCalibration(projectId: ProjectId, mapId: MapId): Promise<MapCalibration | null> {
    const db = await this.projectDb.getConnection(projectId);
    const rows = await db.all<MapCalibrationRow>(
      "SELECT id, project_id, map_id, transform_type, rms_error, created_at, is_active FROM map_calibrations WHERE project_id = ? AND map_id = ? AND is_active = 1 ORDER BY created_at DESC, id DESC LIMIT 1",
      [projectId, mapId]
    );
    if (!rows.length) {
      return null;
    }
    return mapRowToCalibration(rows[0]);
  }
}

export function createCalibrationService(projectDb: ProjectDb): CalibrationService {
  return new DefaultCalibrationService(projectDb);
}
