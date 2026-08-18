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
};

export type UrlInstallResult = {
  id: string;
  name: string;
  owner: string;
  currentVersion: string;
  currentHash: string;
  distributedTo: string[];
  centralPath: string;
  linkPaths: string[];
};
