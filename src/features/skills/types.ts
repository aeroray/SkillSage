export type InstalledSkill = {
  id: string;
  name: string;
  owner: string;
  repo: string;
  skillPath?: string;
  source: string;
  description: string;
  currentVersion: string;
  currentHash: string;
  distributedTo: string[];
  installedAt: string;
  versionHistory: VersionRecord[];
};

export type VersionRecord = {
  commit: string;
  hash: string;
  recordedAt: string;
};

export type InstalledSkillsList = {
  remoteRoot: string;
  localRoot: string;
  skills: InstalledSkill[];
};

export type InstallResult = {
  id: string;
  name: string;
  owner: string;
  currentVersion: string;
  currentHash: string;
  distributedTo: string[];
  centralPath: string;
  linkPaths: string[];
};

export type SkillProgress = {
  skillId: string;
  stage: string;
  message: string;
};

export type UpdateInfo = {
  id: string;
  currentVersion: string;
  currentHash: string;
  latestVersion: string;
  latestHash: string;
  updateAvailable: boolean;
};

export type UpdateCheckList = {
  updates: UpdateInfo[];
};

export type DistributionConflict = {
  toolId: string;
  toolName: string;
  path: string;
  kind: string;
};

export type DistributionActions = Record<string, "skip" | "takeover">;
