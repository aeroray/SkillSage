import type { ThemeAccent, ThemeMode } from "../theme/store";

export type SyncSettings = {
  themeMode: ThemeMode;
  themeAccent: ThemeAccent;
  proxyUrl?: string;
};

export type SyncSkillPreview = {
  id: string;
  name: string;
  description: string;
  source: string;
  currentVersion: string;
  installed: boolean;
};

export type SyncImportPreview = {
  path: string;
  exportedAt: string;
  settings?: SyncSettings;
  skills: SyncSkillPreview[];
};

export type SyncImportOptions = {
  applySettings: boolean;
  selectedIds: string[];
};

export type SyncImportFailure = {
  id: string;
  reason: string;
};

export type SyncImportResult = {
  imported: { id: string; name: string }[];
  skipped: string[];
  failed: SyncImportFailure[];
  settings?: SyncSettings;
};
