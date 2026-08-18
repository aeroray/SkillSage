export type MigrateItem = {
  id: string;
  name: string;
  description: string;
  sourcePath: string;
  displayPath: string;
  location: string;
  kind: string;
  classification: string;
  toolIds: string[];
  remoteOwner?: string;
  remoteRepo?: string;
  remoteSource?: string;
  remoteVersion?: string;
  remoteSkillPath?: string;
  canTakeover: boolean;
  canManualHandle: boolean;
  canRemove: boolean;
  warning?: string;
};

export type MigrateScanResult = {
  items: MigrateItem[];
  scannedRoots: string[];
};

export type MigrateSelection = {
  sourcePath: string;
  agents: string[];
  manual?: boolean;
  targetName?: string;
};

export type MigrateFailure = {
  sourcePath: string;
  reason: string;
};

export type MigrateResult = {
  migrated: string[];
  skipped: string[];
  failed: MigrateFailure[];
};
