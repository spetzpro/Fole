export interface ActivePointer {
  activeVersionId: string;
  lastUpdated: string;
  // Extended fields for Safe Mode
  safeMode: boolean;
  activatedAt: string; // ISO timestamp, usually same as lastUpdated
  activatedByMode: "normal" | "advanced" | "developer";
  safeModeReason?: string;
  safeModeReport?: ValidationReport;
}

export interface ConfigMeta {
  versionId: string;
  author: string;
  timestamp: string;
  description: string;
}

export interface ConfigValidation {
  status: "passed" | "failed" | "warn";
  checkedAt: string;
}

export type ValidationSeverity = "A1" | "A2" | "B";

export interface ValidationError {
  severity: ValidationSeverity;
  code: string;
  message: string;
  path: string;
  blockId?: string;
  relatedBlockIds?: string[];
}

export interface ValidationReport {
  status: "valid" | "invalid";
  validatorVersion: string;
  severityCounts: {
    A1: number;
    A2: number;
    B: number;
  };
  errors: ValidationError[];
}

export interface BlockEnvelope {
  blockId: string;
  blockType: string;
  schemaVersion: string;
  data: Record<string, unknown>;
}

export interface ShellManifest {
  schemaVersion: string;
  regions: Record<string, { blockId: string; config?: Record<string, unknown> }>;
}

export interface ShellBundle {
  versionId: string;
  meta: ConfigMeta;
  validation: ConfigValidation;
  bundle: {
    manifest: ShellManifest;
    blocks: Record<string, BlockEnvelope>;
  };
}
