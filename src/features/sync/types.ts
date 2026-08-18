export type SyncToolPreview = {
  id: string;
  name: string;
  detected: boolean;
  requested: boolean;
};

export type SyncSkillPreview = {
  id: string;
  name: string;
  description: string;
  source: string;
  currentVersion: string;
  distributedTo: string[];
  installed: boolean;
  tools: SyncToolPreview[];
};

export type SyncImportPreview = {
  path: string;
  exportedAt: string;
  skills: SyncSkillPreview[];
};

export type SyncImportOptions = {
  selectedIds: string[];
  agentsBySkill: Record<string, string[]>;
};

export type SyncImportFailure = {
  id: string;
  reason: string;
};

export type SyncImportResult = {
  imported: { id: string; name: string }[];
  skipped: string[];
  failed: SyncImportFailure[];
};
