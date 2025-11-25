// Types for the feature.map module, derived from specs/modules/feature.map.module.md

export type MapId = string;
export type ProjectId = string;

export type MapType = "floorplan" | "site_plan" | "satellite" | "schematic" | "other";
export type MapTag = string;
export type MapStatus = "active" | "archived" | "draft";

export interface MapMetadata {
  mapId: MapId;
  projectId: ProjectId;
  name: string;
  description?: string;
  mapType: MapType;
  tags: MapTag[];
  status: MapStatus;
  createdAt: string; // IsoTimestamp
  updatedAt: string; // IsoTimestamp
  isCalibrated: boolean;
  calibrationTransformType?: "similarity" | "affine" | "other";
  calibrationErrorRms?: number | null;
}

export interface CreateMapInput {
  projectId: ProjectId;
  name: string;
  description?: string;
  mapType: MapType;
  tags?: MapTag[];
}

export interface UpdateMapMetadataInput {
  projectId: ProjectId;
  mapId: MapId;
  name?: string;
  description?: string;
  mapType?: MapType;
  tags?: MapTag[];
}

export interface UpdateMapStatusInput {
  projectId: ProjectId;
  mapId: MapId;
  status: MapStatus;
}

export interface LibImageDescriptor {
  // Exact structure is defined by lib.image; this is a placeholder type.
  kind: string;
  // Additional fields will be added when lib.image is implemented.
}

export interface MapImageHandle {
  projectId: ProjectId;
  mapId: MapId;
  imageDescriptor: LibImageDescriptor;
  widthPx: number;
  heightPx: number;
}

export type CalibrationId = string;
export type CalibrationTransformType = "similarity" | "affine" | "other";

export interface CalibrationControlPoint {
  pixel: { x: number; y: number };
  world: WorldCoord;
  residualError?: number | null;
}

export interface WorldCoord {
  // Exact structure is defined by lib.geo; this is a placeholder type.
  // For now we keep it opaque but strongly typed.
  [key: string]: unknown;
}

export interface MapCalibration {
  calibrationId: CalibrationId;
  mapId: MapId;
  projectId: ProjectId;
  transformType: CalibrationTransformType;
  transform: unknown; // lib.geo GeoTransform type (opaque here)
  controlPoints: CalibrationControlPoint[];
  rmsError?: number | null;
  maxResidualError?: number | null;
  createdAt: string;
  createdByUserId: string;
  isActive: boolean;
}

export interface MapViewport {
  mapId: MapId;
  centerPx: { x: number; y: number };
  zoom: number;
  rotationDeg: number;
}
