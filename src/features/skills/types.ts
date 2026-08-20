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
  installedAt: string;
  versionHistory: VersionRecord[];
};

export type VersionRecord = {
  commit: string;
  hash: string;
  recordedAt: string;
};

export type InstalledSkillsList = {
  skillsRoot: string;
  skills: InstalledSkill[];
};

export type InstallResult = {
  id: string;
  name: string;
  owner: string;
  currentVersion: string;
  currentHash: string;
  installPath: string;
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

/** An untracked foreign path already occupying the flat slot a skill name
 * would install into. Skip/cancel are handled entirely client-side (the
 * caller just doesn't retry the install); only takeover reaches the
 * backend. */
export type PathConflict = {
  name: string;
  path: string;
  kind: "directory" | "link" | string;
};

export type ConflictDecision = "skip" | "takeover" | "cancel";
