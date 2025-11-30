import {
  MapId,
  ProjectId,
  MapMetadata,
  MapStatus,
  MapType,
  MapTag,
  CreateMapInput,
  UpdateMapMetadataInput,
  UpdateMapStatusInput,
} from "./FeatureMapTypes";
import type { ProjectDb } from "../../core/ProjectDb";
import type { PermissionService } from "../../core/permissions/PermissionService";
import type { PermissionContext, ResourceDescriptor } from "../../core/permissions/PermissionModel";

// WriteContext shape is defined conceptually in specs/modules/feature.map.module.md.
// The concrete structure will be aligned with core.storage / AtomicWriteService.
export interface WriteContext {
  userId: string;
  correlationId?: string;
  // TODO: align with core.storage expectations (e.g., requestId, auth context).
}

export interface ListMapsOptions {
  status?: MapStatus[];
  types?: MapType[];
  tagsAny?: MapTag[];
  includeArchived?: boolean;
}

// Public API surface for the map registry, as defined in the module spec.
export interface FeatureMapService {
  listMaps(projectId: ProjectId, options?: ListMapsOptions): Promise<MapMetadata[]>;

  getMap(projectId: ProjectId, mapId: MapId): Promise<MapMetadata | null>;

  createMap(input: CreateMapInput, ctx: WriteContext): Promise<MapMetadata>;

  updateMapMetadata(input: UpdateMapMetadataInput, ctx: WriteContext): Promise<MapMetadata>;

  updateMapStatus(input: UpdateMapStatusInput, ctx: WriteContext): Promise<MapMetadata>;
}


interface FeatureMapServiceDeps {
  projectDb: ProjectDb;
  permissionService: PermissionService;
  getPermissionContext?: () => PermissionContext;
  // Optional diagnostics/logger dependency; kept minimal for now.
  logger?: { debug(message: string, meta?: unknown): void };
}

export class DefaultFeatureMapService implements FeatureMapService {
  constructor(private readonly deps: FeatureMapServiceDeps) {
    if (!deps.projectDb) {
      throw new Error("FeatureMapServiceDeps.projectDb is required");
    }
    if (!deps.permissionService) {
      throw new Error("FeatureMapServiceDeps.permissionService is required");
    }
  }

  async listMaps(projectId: ProjectId, options?: ListMapsOptions): Promise<MapMetadata[]> {
    const permissionContext: PermissionContext = this.deps.getPermissionContext
      ? this.deps.getPermissionContext()
      : {
          user: null,
          globalPermissions: [],
        };
    await this.ensureReadPermission(projectId, permissionContext);

    const conn = await this.deps.projectDb.getConnection(projectId);
    // NOTE: SQL shape is based on _AI_DB_AND_DATA_MODELS_SPEC.md
    // and may be adjusted if the concrete schema differs.
    const rows = await conn.executeQuery<any>({
      text: `SELECT m.map_id AS mapId,
                    m.project_id AS projectId,
                    m.name AS name,
                    m.description AS description,
                    m.map_type AS mapType,
                    m.tags_json AS tagsJson,
                    m.status AS status,
                    m.created_at AS createdAt,
                    m.updated_at AS updatedAt,
                    ac.transform_type AS calibrationTransformType,
                    ac.rms_error AS calibrationErrorRms
             FROM maps m
             LEFT JOIN map_calibrations ac
               ON ac.project_id = m.project_id
              AND ac.map_id = m.map_id
              AND ac.is_active = 1
            WHERE m.project_id = ?`,
      parameters: [projectId],
    });

    let filtered = rows as any[];

    if (options) {
      if (options.status && options.status.length > 0) {
        filtered = filtered.filter((row) => options.status!.includes(row.status));
      }
      if (options.types && options.types.length > 0) {
        filtered = filtered.filter((row) => options.types!.includes(row.mapType));
      }
      if (options.tagsAny && options.tagsAny.length > 0) {
        filtered = filtered.filter((row) => {
          const tags: string[] = Array.isArray(row.tagsJson)
            ? row.tagsJson
            : typeof row.tagsJson === "string"
            ? JSON.parse(row.tagsJson)
            : [];
          return tags.some((t) => options.tagsAny!.includes(t));
        });
      }
      if (!options.includeArchived) {
        filtered = filtered.filter((row) => row.status !== "archived");
      }
    }

    return filtered.map((row) => this.mapRowToMetadata(row));
  }

  async getMap(projectId: ProjectId, mapId: MapId): Promise<MapMetadata | null> {
    const permissionContext: PermissionContext = this.deps.getPermissionContext
      ? this.deps.getPermissionContext()
      : {
          user: null,
          globalPermissions: [],
        };
    await this.ensureReadPermission(projectId, permissionContext);

    const conn = await this.deps.projectDb.getConnection(projectId);
    const rows = await conn.executeQuery<any>({
      text: `SELECT m.map_id AS mapId,
                    m.project_id AS projectId,
                    m.name AS name,
                    m.description AS description,
                    m.map_type AS mapType,
                    m.tags_json AS tagsJson,
                    m.status AS status,
                    m.created_at AS createdAt,
                    m.updated_at AS updatedAt,
                    ac.transform_type AS calibrationTransformType,
                    ac.rms_error AS calibrationErrorRms
             FROM maps m
             LEFT JOIN map_calibrations ac
               ON ac.project_id = m.project_id
              AND ac.map_id = m.map_id
              AND ac.is_active = 1
            WHERE m.project_id = ? AND m.map_id = ?`,
      parameters: [projectId, mapId],
    });

    const row = rows[0];
    if (!row) {
      return null;
    }

    return this.mapRowToMetadata(row);
  }

  async createMap(input: CreateMapInput, ctx: WriteContext): Promise<MapMetadata> {
    // TODO: enforce map.manage permission and perform atomic write (map_create).
    throw new Error("NotImplemented: createMap");
  }

  async updateMapMetadata(input: UpdateMapMetadataInput, ctx: WriteContext): Promise<MapMetadata> {
    // TODO: enforce map.manage permission and perform atomic write (map_update_metadata).
    throw new Error("NotImplemented: updateMapMetadata");
  }

  async updateMapStatus(input: UpdateMapStatusInput, ctx: WriteContext): Promise<MapMetadata> {
    // TODO: enforce map.manage permission and perform atomic write (map_update_status).
    throw new Error("NotImplemented: updateMapStatus");
  }

  private async ensureReadPermission(projectId: ProjectId, ctx: PermissionContext): Promise<void> {
    const resource: ResourceDescriptor = { type: "project", id: projectId, projectId };
    const allowed = this.deps.permissionService.can(ctx, "PROJECT_READ", resource);
    if (!allowed) {
      const error = new Error("Forbidden: map.read required for project");
      (error as any).code = "FORBIDDEN";
      throw error;
    }
  }

  private mapRowToMetadata(row: any): MapMetadata {
    const tags: string[] = Array.isArray(row.tagsJson)
      ? row.tagsJson
      : typeof row.tagsJson === "string" && row.tagsJson.length > 0
      ? JSON.parse(row.tagsJson)
      : [];

    const isCalibrated = row.calibrationTransformType != null;

    return {
      mapId: row.mapId,
      projectId: row.projectId,
      name: row.name,
      description: row.description ?? undefined,
      mapType: row.mapType as MapType,
      tags,
      status: row.status as MapStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      isCalibrated,
      calibrationTransformType: row.calibrationTransformType ?? undefined,
      calibrationErrorRms:
        row.calibrationErrorRms === undefined ? null : row.calibrationErrorRms,
    };
  }
}
