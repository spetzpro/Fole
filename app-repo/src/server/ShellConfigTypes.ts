export interface ActivePointer {
  activeVersionId: string;
  lastUpdated: string;
  // Extended fields for Safe Mode
  safeMode: boolean;
  activatedAt: string; // ISO timestamp, usually same as lastUpdated
  activatedByMode: "normal" | "advanced" | "developer";
  activationReason?: string | null;
  safeModeReason?: string;
  safeModeReport?: ValidationReport;
}

export interface ConfigMeta {
  versionId: string;
  author: string;
  timestamp: string;
  description: string;
  mode?: string;
  parentVersionId?: string;
}

export interface ConfigValidation {
  status: "passed" | "failed" | "warn";
  checkedAt: string;
  warnings?: ValidationError[];
}

export type ValidationSeverity = "A1" | "A2" | "B";

export interface ValidationError {
  severity: ValidationSeverity;
  code: string;
  message: string;
  path: string;
  meta?: any;
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
  // Regions can use canonical keys (header, viewport, footer) or legacy (top, main, bottom).
  // Canonical keys take precedence.
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
