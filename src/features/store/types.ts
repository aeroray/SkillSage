export type SkillSearchResult = {
  id: string;
  slug: string;
  name: string;
  source: string;
  installs: number;
  sourceType: string;
  installUrl?: string;
  url: string;
  isDuplicate: boolean;
};

export type LeaderboardRange = "all-time" | "trending" | "hot";

export type AuditEntry = {
  provider: string;
  slug: string;
  status: string;
  summary: string;
  auditedAt?: string;
  riskLevel?: string;
};

export type SkillDetail = {
  id: string;
  source: string;
  slug: string;
  name: string;
  description: string;
  license?: string;
  installs: number;
  githubStars?: number;
  url: string;
  audits: AuditEntry[];
};

export type SkillGroup = {
  source: string;
  primary: SkillSearchResult;
  additional: SkillSearchResult[];
};
