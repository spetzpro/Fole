export interface ActivePointer {
  activeVersionId: string;
  lastUpdated: string;
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

export interface ValidationError {
  severity: "error" | "warning";
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
    error: number;
    warning: number;
    info: number;
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
