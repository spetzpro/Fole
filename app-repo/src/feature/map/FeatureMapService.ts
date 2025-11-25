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

// Dependencies are kept abstract for now; real wiring will follow core.storage
// and permissions specs. This class is a stub implementation to establish the
// surface area without behavior.
interface FeatureMapServiceDeps {
  // TODO: inject ProjectDb / AtomicWriteService / PermissionService when implementing.
}

export class DefaultFeatureMapService implements FeatureMapService {
  constructor(private readonly deps: FeatureMapServiceDeps) {
    // TODO: validate dependencies once real types are known.
  }

  async listMaps(projectId: ProjectId, options?: ListMapsOptions): Promise<MapMetadata[]> {
    // TODO: implement using project.db maps table and calibration summary.
    // Spec references:
    // - specs/blocks/feature.map.block.md (map registry)
    // - specs/modules/feature.map.module.md (listMaps API)
    // - _AI_DB_AND_DATA_MODELS_SPEC.md (maps + map_calibrations tables)
    return [];
  }

  async getMap(projectId: ProjectId, mapId: MapId): Promise<MapMetadata | null> {
    // TODO: implement lookup by projectId + mapId with calibration summary.
    return null;
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
}
