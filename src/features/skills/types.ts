export type InstalledSkill = {
  id: string;
  name: string;
  owner: string;
  repo: string;
  skillPath?: string;
  source: string;
  currentVersion: string;
  currentHash: string;
  distributedTo: string[];
  installedAt: string;
};

export type InstalledSkillsList = {
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
