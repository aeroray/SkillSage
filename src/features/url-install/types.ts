export type GithubUrlResult = {
  owner: string;
  repo: string;
  skillPath?: string;
  commit: string;
  canonicalUrl: string;
};

export type UrlSkillCandidate = {
  name: string;
  description: string;
  skillPath: string;
  url: string;
};

export type GithubUrlInspection = {
  parsed: GithubUrlResult;
  skills: UrlSkillCandidate[];
  /** The exact commit the candidates were read from. Echoed back to the install
   * so it is pinned to what was previewed. */
  resolvedCommit: string;
};

export type UrlInstallResult = {
  id: string;
  name: string;
  owner: string;
  currentVersion: string;
  currentHash: string;
  installedPath: string;
};
