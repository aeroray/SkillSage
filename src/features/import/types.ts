export type ImportPreview = {
  sourcePath: string;
  sourceKind: "file" | "directory" | string;
  skillRoot: string;
  name: string;
  description: string;
  fileCount: number;
  existingLocal: boolean;
  existingSkillId?: string;
  remoteConflict: boolean;
};

export type ImportResult = {
  id: string;
  name: string;
  owner: string;
  currentVersion: string;
  currentHash: string;
  installedPath: string;
};
