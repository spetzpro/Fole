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

export interface ShellManifest {
  regions: Record<string, { blockId: string; config?: Record<string, unknown> }>;
}

export interface ShellBundle {
  versionId: string;
  meta: ConfigMeta;
  validation: ConfigValidation;
  bundle: {
    manifest: ShellManifest;
  };
}
